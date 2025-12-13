"""
@guard decorator for automatic human verification of AI functions.

Provides a decorator that wraps AI functions to automatically request
human verification when confidence levels fall below configurable thresholds.
"""

import functools
from typing import Optional, Dict, Any, Callable
from .exceptions import HumanVerificationError


def guard(
    threshold: float = 0.9,
    agent_id: Optional[str] = None,
    reward: Optional[str] = None,
    reward_amount: Optional[float] = None,
    category: Optional[str] = None,
    escrow_amount: Optional[str] = None,
    timeout: int = 300,
    fallback_on_error: bool = True
) -> Callable:
    """
    Decorator for automatic human verification of AI functions.
    
    Wraps AI functions to automatically request human verification when
    confidence levels fall below the specified threshold.
    
    Args:
        threshold: Minimum confidence level (0.0-1.0) to bypass human verification
        agent_id: Optional agent identifier for human verification requests
        reward: Optional reward amount string (e.g., "0.3 USDC")
        reward_amount: Optional reward amount as float (e.g., 0.3)
        category: Optional task category (e.g., "Verification")
        escrow_amount: Optional escrow amount string (e.g., "0.6 USDC")
        timeout: Timeout in seconds for human verification
        fallback_on_error: If True, return original result on verification errors
        
    Returns:
        Decorated function that includes human verification logic
        
    Example:
        @guard(threshold=0.8, agent_id="SentimentBot", reward="0.3 USDC")
        def analyze_sentiment(text: str) -> dict:
            # AI analysis logic here
            return {
                "answer": "POSITIVE",
                "confidence": 0.75,
                "reasoning": "Analysis shows positive sentiment"
            }
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Dict[str, Any]:
            # Execute the original AI function
            result = func(*args, **kwargs)
            
            # Validate result structure
            if not isinstance(result, dict):
                raise HumanVerificationError(
                    f"Function {func.__name__} must return a dictionary with 'confidence' field"
                )
            
            confidence = result.get("confidence")
            
            # If no confidence field, assume high confidence and return result
            if confidence is None:
                return result
            
            # Validate confidence value
            if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
                raise HumanVerificationError(
                    f"Confidence must be a number between 0 and 1, got: {confidence}"
                )
            
            # If confidence is above threshold, return result immediately
            if confidence >= threshold:
                return result
            
            # Confidence is below threshold - request human verification
            try:
                human_result = _request_human_verification(
                    original_result=result,
                    function_name=func.__name__,
                    agent_id=agent_id,
                    reward=reward,
                    reward_amount=reward_amount,
                    category=category,
                    escrow_amount=escrow_amount,
                    timeout=timeout,
                    args=args,
                    kwargs=kwargs
                )
                
                # Combine original result with human verdict
                combined_result = result.copy()
                combined_result["human_verdict"] = human_result
                
                return combined_result
                
            except Exception as e:
                if fallback_on_error:
                    # Return original result with error information
                    result_with_error = result.copy()
                    result_with_error["human_verification_error"] = str(e)
                    return result_with_error
                else:
                    raise HumanVerificationError(f"Human verification failed: {e}")
        
        return wrapper
    return decorator


def _request_human_verification(
    original_result: Dict[str, Any],
    function_name: str,
    agent_id: Optional[str],
    reward: Optional[str],
    reward_amount: Optional[float],
    category: Optional[str],
    escrow_amount: Optional[str],
    timeout: int,
    args: tuple,
    kwargs: dict
) -> Dict[str, Any]:
    """
    Request human verification through the HumanRPC API.
    
    Args:
        original_result: Original AI function result
        function_name: Name of the decorated function
        agent_id: Agent identifier
        reward: Reward amount string
        reward_amount: Reward amount as float
        category: Task category
        escrow_amount: Escrow amount string
        timeout: Timeout in seconds
        args: Original function arguments
        kwargs: Original function keyword arguments
        
    Returns:
        Human verification result
        
    Raises:
        HumanVerificationError: If verification request fails
    """
    # Import here to avoid circular imports
    from .agent import AutoAgent
    
    try:
        # Create AutoAgent instance for human verification
        agent = AutoAgent()
        
        # Prepare context for human verification
        # Extract the original query/input from function arguments
        user_query = _extract_user_query(args, kwargs, function_name)
        
        context = {
            "type": "ai_verification",
            "summary": f"Verify AI analysis from {function_name}. Confidence: {original_result.get('confidence', 0):.3f}",
            "data": {
                "userQuery": user_query,
                "agentConclusion": str(original_result.get("answer", original_result)),
                "confidence": original_result.get("confidence", 0),
                "reasoning": original_result.get("reasoning", "No reasoning provided")
            }
        }
        
        # Determine agent name and reward
        agent_name = agent_id or f"GuardedFunction_{function_name}"
        
        # Request human verification
        human_result = agent.ask_human_rpc(
            text=user_query,
            agentName=agent_name,
            reward=reward,
            rewardAmount=reward_amount,
            category=category,
            escrowAmount=escrow_amount,
            context=context
        )
        
        return human_result
        
    except Exception as e:
        raise HumanVerificationError(f"Failed to request human verification: {e}")


def _extract_user_query(args: tuple, kwargs: dict, function_name: str) -> str:
    """
    Extract user query from function arguments.
    
    Attempts to find the most likely user input from the function arguments.
    
    Args:
        args: Function positional arguments
        kwargs: Function keyword arguments
        function_name: Name of the function
        
    Returns:
        Extracted user query string
    """
    # Common parameter names that likely contain user input
    query_params = ["text", "query", "input", "message", "content", "data"]
    
    # Check keyword arguments first
    for param in query_params:
        if param in kwargs and isinstance(kwargs[param], str):
            return kwargs[param]
    
    # Check positional arguments
    if args:
        # First argument is often the main input
        first_arg = args[0]
        if isinstance(first_arg, str):
            return first_arg
        elif isinstance(first_arg, dict) and "text" in first_arg:
            return str(first_arg["text"])
    
    # Fallback: create a description from available arguments
    if args or kwargs:
        return f"Function {function_name} called with args: {args}, kwargs: {kwargs}"
    
    return f"Function {function_name} called with no arguments"