"""
Reiterator module for automatic retry logic on negative consensus outcomes.

Provides automatic retry functionality for human-RPC tasks when consensus
results are negative, with configurable backoff strategies and rate limiting.
"""

import time
import logging
from typing import Dict, Any, Callable, Optional
from datetime import datetime, timezone
from .exceptions import ReiteratorConfigurationError, ReiteratorMaxAttemptsError, ReiteratorRateLimitError


class ReiteratorManager:
    """
    Manages automatic retry logic for negative consensus outcomes.
    
    Implements configurable backoff strategies and rate limiting to ensure
    responsible retry behavior while attempting to achieve positive consensus.
    """
    
    def __init__(
        self,
        max_attempts: int = 3,
        backoff_strategy: str = "exponential",
        base_delay: float = 1.0,
        max_delay: float = 60.0
    ):
        """
        Initialize the ReiteratorManager.
        
        Args:
            max_attempts: Maximum number of retry attempts (must be >= 1)
            backoff_strategy: Strategy for calculating delays ("exponential", "linear", "fixed")
            base_delay: Base delay in seconds for backoff calculation (must be > 0)
            max_delay: Maximum delay in seconds to cap backoff (must be >= base_delay)
            
        Raises:
            ReiteratorConfigurationError: If configuration parameters are invalid
        """
        # Validate configuration
        if not isinstance(max_attempts, int) or max_attempts < 1:
            raise ReiteratorConfigurationError("max_attempts must be an integer >= 1")
        
        if backoff_strategy not in ["exponential", "linear", "fixed"]:
            raise ReiteratorConfigurationError(
                "backoff_strategy must be one of: exponential, linear, fixed"
            )
        
        if not isinstance(base_delay, (int, float)) or base_delay <= 0:
            raise ReiteratorConfigurationError("base_delay must be a positive number")
        
        if not isinstance(max_delay, (int, float)) or max_delay < base_delay:
            raise ReiteratorConfigurationError("max_delay must be >= base_delay")
        
        self.max_attempts = max_attempts
        self.backoff_strategy = backoff_strategy
        self.base_delay = float(base_delay)
        self.max_delay = float(max_delay)
        
        # Runtime state
        self.current_attempt = 0
        self.total_retries = 0
        self.last_retry_time = None
        self.current_task_id = None
        self.last_result = None
        self.active = False
        
        # Set up logging
        self.logger = logging.getLogger(__name__)
    
    def should_retry(self, result: Dict[str, Any], attempt_count: int) -> bool:
        """
        Determine if a retry should be attempted based on the result.
        
        Args:
            result: Result dictionary from human-RPC task
            attempt_count: Current attempt number (0-indexed)
            
        Returns:
            True if retry should be attempted, False otherwise
        """
        # Don't retry if max attempts reached
        if attempt_count >= self.max_attempts:
            return False
        
        # Check for negative consensus indicators
        if not isinstance(result, dict):
            return False
        
        # Check various negative consensus indicators
        sentiment = result.get("sentiment", "").lower()
        decision = result.get("decision", "").lower()
        
        # Negative sentiment indicators
        negative_sentiments = ["negative", "reject", "disapprove", "deny", "refuse"]
        negative_decisions = ["reject", "deny", "disapprove", "negative", "no"]
        
        is_negative = (
            sentiment in negative_sentiments or
            decision in negative_decisions or
            result.get("approved", True) is False or
            result.get("consensus", "positive").lower() == "negative"
        )
        
        return is_negative
    
    def calculate_delay(self, attempt_count: int) -> float:
        """
        Calculate delay before next retry attempt.
        
        Args:
            attempt_count: Current attempt number (0-indexed)
            
        Returns:
            Delay in seconds before next retry
        """
        if self.backoff_strategy == "fixed":
            delay = self.base_delay
        elif self.backoff_strategy == "linear":
            delay = self.base_delay * (attempt_count + 1)
        elif self.backoff_strategy == "exponential":
            delay = self.base_delay * (2 ** attempt_count)
        else:
            # Fallback to exponential
            delay = self.base_delay * (2 ** attempt_count)
        
        # Cap at max_delay
        return min(delay, self.max_delay)
    
    def execute_with_retry(
        self,
        task_func: Callable,
        *args,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Execute a task function with automatic retry logic.
        
        Args:
            task_func: Function to execute (should return dict with result)
            *args: Positional arguments for task_func
            **kwargs: Keyword arguments for task_func
            
        Returns:
            Final result from task execution
            
        Raises:
            ReiteratorMaxAttemptsError: If max attempts reached without positive consensus
            ReiteratorRateLimitError: If rate limiting violations occur
        """
        self.active = True
        self.current_attempt = 0
        original_args = args
        original_kwargs = kwargs.copy()
        
        try:
            while self.current_attempt < self.max_attempts:
                try:
                    # Execute the task
                    result = task_func(*original_args, **original_kwargs)
                    self.last_result = result
                    
                    # Extract task ID if available
                    if isinstance(result, dict):
                        self.current_task_id = result.get("task_id")
                    
                    # Check if we should retry
                    if not self.should_retry(result, self.current_attempt):
                        # Positive consensus achieved or no retry needed
                        self.logger.info(
                            f"Reiterator: Positive consensus achieved on attempt {self.current_attempt + 1}"
                        )
                        return result
                    
                    # Negative consensus - prepare for retry
                    self.current_attempt += 1
                    self.total_retries += 1
                    
                    if self.current_attempt >= self.max_attempts:
                        # Max attempts reached
                        self.logger.warning(
                            f"Reiterator: Max attempts ({self.max_attempts}) reached without positive consensus"
                        )
                        raise ReiteratorMaxAttemptsError(
                            f"Maximum retry attempts ({self.max_attempts}) reached without positive consensus. "
                            f"Final result: {result}"
                        )
                    
                    # Calculate and apply delay
                    delay = self.calculate_delay(self.current_attempt - 1)
                    self.logger.info(
                        f"Reiterator: Negative consensus on attempt {self.current_attempt}. "
                        f"Retrying in {delay:.1f}s..."
                    )
                    
                    # Record retry time
                    self.last_retry_time = datetime.now(timezone.utc).isoformat()
                    
                    # Wait before retry
                    time.sleep(delay)
                    
                except (ReiteratorMaxAttemptsError, ReiteratorRateLimitError):
                    # Re-raise reiterator-specific exceptions
                    raise
                except Exception as e:
                    # Handle API errors gracefully
                    self.current_attempt += 1
                    
                    if self.current_attempt >= self.max_attempts:
                        raise ReiteratorRateLimitError(
                            f"API error on final attempt: {e}"
                        )
                    
                    # Apply exponential backoff for errors
                    error_delay = min(self.base_delay * (2 ** (self.current_attempt - 1)), self.max_delay)
                    self.logger.warning(
                        f"Reiterator: API error on attempt {self.current_attempt}: {e}. "
                        f"Retrying in {error_delay:.1f}s..."
                    )
                    
                    time.sleep(error_delay)
            
            # This should not be reached due to the max attempts check above
            raise ReiteratorMaxAttemptsError(
                f"Maximum retry attempts ({self.max_attempts}) reached"
            )
            
        finally:
            self.active = False
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current reiterator status and statistics.
        
        Returns:
            Dictionary containing current status information
        """
        next_retry_time = None
        if self.active and self.last_retry_time:
            try:
                last_time = datetime.fromisoformat(self.last_retry_time.replace('Z', '+00:00'))
                delay = self.calculate_delay(self.current_attempt)
                next_time = last_time.timestamp() + delay
                next_retry_time = datetime.fromtimestamp(next_time, timezone.utc).isoformat()
            except Exception:
                next_retry_time = None
        
        return {
            "active": self.active,
            "current_task_id": self.current_task_id,
            "attempt_count": self.current_attempt,
            "max_attempts": self.max_attempts,
            "next_retry_time": next_retry_time,
            "total_retries_session": self.total_retries,
            "last_result": self.last_result.get("sentiment") if isinstance(self.last_result, dict) else None,
            "backoff_strategy": self.backoff_strategy,
            "base_delay": self.base_delay,
            "max_delay": self.max_delay
        }
    
    def reset(self) -> None:
        """
        Reset reiterator state for a new task sequence.
        
        Clears current attempt count and task-specific state while
        preserving configuration and session statistics.
        """
        self.current_attempt = 0
        self.current_task_id = None
        self.last_result = None
        self.active = False
        self.last_retry_time = None
        
        self.logger.debug("Reiterator: State reset for new task sequence")