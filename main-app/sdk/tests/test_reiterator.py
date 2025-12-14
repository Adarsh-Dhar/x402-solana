"""
Property-based tests for reiterator functionality.

Tests the ReiteratorManager class and its integration with AutoAgent
using property-based testing to verify correctness across various inputs.
"""

import pytest
import time
from unittest.mock import Mock, patch
from hypothesis import given, strategies as st, settings
from human_rpc_sdk.reiterator import ReiteratorManager
from human_rpc_sdk.exceptions import (
    ReiteratorConfigurationError,
    ReiteratorMaxAttemptsError,
    ReiteratorRateLimitError
)


class TestReiteratorConfiguration:
    """Test reiterator configuration validation."""
    
    @given(
        max_attempts=st.integers(min_value=1, max_value=10),
        backoff_strategy=st.sampled_from(["exponential", "linear", "fixed"]),
        base_delay=st.floats(min_value=0.1, max_value=10.0),
        max_delay=st.floats(min_value=1.0, max_value=100.0)
    )
    @settings(max_examples=100)
    def test_valid_configuration_accepted(self, max_attempts, backoff_strategy, base_delay, max_delay):
        """
        **Feature: human-rpc-python-sdk, Property 11: Reiterator configuration validation**
        
        For any valid reiterator configuration parameters, the system should accept
        the configuration and initialize successfully.
        """
        # Ensure max_delay >= base_delay
        if max_delay < base_delay:
            max_delay = base_delay + 1.0
        
        # Should not raise any exception
        reiterator = ReiteratorManager(
            max_attempts=max_attempts,
            backoff_strategy=backoff_strategy,
            base_delay=base_delay,
            max_delay=max_delay
        )
        
        # Verify configuration is stored correctly
        assert reiterator.max_attempts == max_attempts
        assert reiterator.backoff_strategy == backoff_strategy
        assert reiterator.base_delay == base_delay
        assert reiterator.max_delay == max_delay
    
    @given(
        max_attempts=st.one_of(
            st.integers(max_value=0),  # Invalid: <= 0
            st.floats(),  # Invalid: not integer
            st.text(),  # Invalid: not number
            st.none()  # Invalid: None
        )
    )
    @settings(max_examples=50)
    def test_invalid_max_attempts_rejected(self, max_attempts):
        """
        **Feature: human-rpc-python-sdk, Property 11: Reiterator configuration validation**
        
        For any invalid max_attempts parameter, the system should reject the
        configuration with a descriptive error message.
        """
        with pytest.raises(ReiteratorConfigurationError) as exc_info:
            ReiteratorManager(max_attempts=max_attempts)
        
        assert "max_attempts must be an integer >= 1" in str(exc_info.value)
    
    @given(
        backoff_strategy=st.text().filter(
            lambda x: x not in ["exponential", "linear", "fixed"]
        )
    )
    @settings(max_examples=50)
    def test_invalid_backoff_strategy_rejected(self, backoff_strategy):
        """
        **Feature: human-rpc-python-sdk, Property 11: Reiterator configuration validation**
        
        For any invalid backoff_strategy parameter, the system should reject the
        configuration with a descriptive error message.
        """
        with pytest.raises(ReiteratorConfigurationError) as exc_info:
            ReiteratorManager(backoff_strategy=backoff_strategy)
        
        assert "backoff_strategy must be one of: exponential, linear, fixed" in str(exc_info.value)
    
    @given(
        base_delay=st.one_of(
            st.floats(max_value=0.0),  # Invalid: <= 0
            st.text(),  # Invalid: not number
            st.none()  # Invalid: None
        )
    )
    @settings(max_examples=50)
    def test_invalid_base_delay_rejected(self, base_delay):
        """
        **Feature: human-rpc-python-sdk, Property 11: Reiterator configuration validation**
        
        For any invalid base_delay parameter, the system should reject the
        configuration with a descriptive error message.
        """
        with pytest.raises(ReiteratorConfigurationError) as exc_info:
            ReiteratorManager(base_delay=base_delay)
        
        assert "base_delay must be a positive number" in str(exc_info.value)
    
    @given(
        base_delay=st.floats(min_value=1.0, max_value=10.0),
        max_delay=st.floats(min_value=0.1, max_value=0.9)  # max_delay < base_delay
    )
    @settings(max_examples=50)
    def test_max_delay_less_than_base_delay_rejected(self, base_delay, max_delay):
        """
        **Feature: human-rpc-python-sdk, Property 11: Reiterator configuration validation**
        
        For any configuration where max_delay < base_delay, the system should
        reject the configuration with a descriptive error message.
        """
        with pytest.raises(ReiteratorConfigurationError) as exc_info:
            ReiteratorManager(base_delay=base_delay, max_delay=max_delay)
        
        assert "max_delay must be >= base_delay" in str(exc_info.value)


class TestNegativeConsensusRetryTrigger:
    """Test negative consensus detection and retry triggering."""
    
    @given(
        sentiment=st.sampled_from(["negative", "reject", "disapprove", "deny", "refuse"]),
        attempt_count=st.integers(min_value=0, max_value=2)
    )
    @settings(max_examples=50)
    def test_negative_sentiment_triggers_retry(self, sentiment, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 12: Negative consensus retry trigger**
        
        For any result with negative sentiment indicators, the reiterator should
        trigger retry when enabled and within max attempts.
        """
        reiterator = ReiteratorManager(max_attempts=3)
        result = {"sentiment": sentiment}
        
        should_retry = reiterator.should_retry(result, attempt_count)
        assert should_retry is True
    
    @given(
        decision=st.sampled_from(["reject", "deny", "disapprove", "negative", "no"]),
        attempt_count=st.integers(min_value=0, max_value=2)
    )
    @settings(max_examples=50)
    def test_negative_decision_triggers_retry(self, decision, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 12: Negative consensus retry trigger**
        
        For any result with negative decision indicators, the reiterator should
        trigger retry when enabled and within max attempts.
        """
        reiterator = ReiteratorManager(max_attempts=3)
        result = {"decision": decision}
        
        should_retry = reiterator.should_retry(result, attempt_count)
        assert should_retry is True
    
    @given(
        sentiment=st.sampled_from(["positive", "approve", "accept", "good", "excellent"]),
        decision=st.sampled_from(["approve", "accept", "positive", "yes", "good"]),
        attempt_count=st.integers(min_value=0, max_value=5)
    )
    @settings(max_examples=50)
    def test_positive_consensus_stops_retry(self, sentiment, decision, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 12: Negative consensus retry trigger**
        
        For any result with positive consensus indicators, the reiterator should
        not trigger retry regardless of attempt count.
        """
        reiterator = ReiteratorManager(max_attempts=10)
        result = {"sentiment": sentiment, "decision": decision}
        
        should_retry = reiterator.should_retry(result, attempt_count)
        assert should_retry is False
    
    @given(
        max_attempts=st.integers(min_value=1, max_value=5),
        attempt_count=st.integers(min_value=0, max_value=10)
    )
    @settings(max_examples=50)
    def test_max_attempts_prevents_retry(self, max_attempts, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 12: Negative consensus retry trigger**
        
        For any attempt count >= max_attempts, the reiterator should not trigger
        retry regardless of consensus result.
        """
        reiterator = ReiteratorManager(max_attempts=max_attempts)
        result = {"sentiment": "negative"}  # Would normally trigger retry
        
        should_retry = reiterator.should_retry(result, attempt_count)
        
        if attempt_count >= max_attempts:
            assert should_retry is False
        else:
            assert should_retry is True


class TestRateLimitingAndBackoff:
    """Test rate limiting and backoff behavior."""
    
    @given(
        backoff_strategy=st.sampled_from(["exponential", "linear", "fixed"]),
        base_delay=st.floats(min_value=0.1, max_value=2.0),
        max_delay=st.floats(min_value=5.0, max_value=20.0),
        attempt_count=st.integers(min_value=0, max_value=5)
    )
    @settings(max_examples=100)
    def test_backoff_delay_calculation(self, backoff_strategy, base_delay, max_delay, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 13: Rate limiting and backoff behavior**
        
        For any backoff configuration and attempt count, the calculated delay should
        follow the specified strategy and respect the maximum delay limit.
        """
        reiterator = ReiteratorManager(
            backoff_strategy=backoff_strategy,
            base_delay=base_delay,
            max_delay=max_delay
        )
        
        delay = reiterator.calculate_delay(attempt_count)
        
        # Delay should never exceed max_delay
        assert delay <= max_delay
        
        # Delay should be positive
        assert delay > 0
        
        # Check strategy-specific behavior
        if backoff_strategy == "fixed":
            assert delay == min(base_delay, max_delay)
        elif backoff_strategy == "linear":
            expected = base_delay * (attempt_count + 1)
            assert delay == min(expected, max_delay)
        elif backoff_strategy == "exponential":
            expected = base_delay * (2 ** attempt_count)
            assert delay == min(expected, max_delay)
    
    @given(
        base_delay=st.floats(min_value=0.1, max_value=1.0),
        attempt_count=st.integers(min_value=0, max_value=3)
    )
    @settings(max_examples=50)
    def test_exponential_backoff_increases(self, base_delay, attempt_count):
        """
        **Feature: human-rpc-python-sdk, Property 13: Rate limiting and backoff behavior**
        
        For exponential backoff strategy, delays should increase exponentially
        with attempt count until capped by max_delay.
        """
        reiterator = ReiteratorManager(
            backoff_strategy="exponential",
            base_delay=base_delay,
            max_delay=100.0  # High enough to not interfere
        )
        
        if attempt_count > 0:
            delay_current = reiterator.calculate_delay(attempt_count)
            delay_previous = reiterator.calculate_delay(attempt_count - 1)
            
            # Current delay should be at least double the previous (exponential growth)
            assert delay_current >= delay_previous * 1.9  # Allow for floating point precision


class TestParameterPreservation:
    """Test parameter preservation during retries."""
    
    @given(
        original_args=st.lists(st.integers(), min_size=0, max_size=5),
        original_kwargs=st.dictionaries(
            st.text(min_size=1, max_size=10),
            st.one_of(st.integers(), st.text(), st.floats()),
            min_size=0,
            max_size=5
        )
    )
    @settings(max_examples=50)
    def test_parameters_preserved_across_retries(self, original_args, original_kwargs):
        """
        **Feature: human-rpc-python-sdk, Property 14: Parameter preservation during retries**
        
        For any retry attempt, the new task submission should contain identical
        parameters to the original request.
        """
        reiterator = ReiteratorManager(max_attempts=3, base_delay=0.01)  # Fast for testing
        
        call_count = 0
        captured_calls = []
        
        def mock_task_func(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            captured_calls.append((args, kwargs))
            
            # Return negative result for first 2 attempts, positive for 3rd
            if call_count < 3:
                return {"sentiment": "negative", "task_id": f"task_{call_count}"}
            else:
                return {"sentiment": "positive", "task_id": f"task_{call_count}"}
        
        # Execute with retry
        result = reiterator.execute_with_retry(mock_task_func, *original_args, **original_kwargs)
        
        # Should have been called 3 times (2 retries + 1 success)
        assert call_count == 3
        assert len(captured_calls) == 3
        
        # All calls should have identical parameters
        for args, kwargs in captured_calls:
            assert args == tuple(original_args)
            assert kwargs == original_kwargs
        
        # Final result should be positive
        assert result["sentiment"] == "positive"


class TestPositiveConsensusTermination:
    """Test positive consensus termination behavior."""
    
    @given(
        positive_sentiment=st.sampled_from(["positive", "approve", "accept", "good", "excellent"]),
        attempt_number=st.integers(min_value=1, max_value=5)
    )
    @settings(max_examples=50)
    def test_positive_consensus_stops_retries(self, positive_sentiment, attempt_number):
        """
        **Feature: human-rpc-python-sdk, Property 15: Positive consensus termination**
        
        For any reiterator sequence that achieves positive consensus, the system
        should return the successful result and stop further retry attempts.
        """
        reiterator = ReiteratorManager(max_attempts=10, base_delay=0.01)  # Fast for testing
        
        call_count = 0
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            
            # Return negative results until the specified attempt, then positive
            if call_count < attempt_number:
                return {"sentiment": "negative", "task_id": f"task_{call_count}"}
            else:
                return {"sentiment": positive_sentiment, "task_id": f"task_{call_count}"}
        
        # Execute with retry
        result = reiterator.execute_with_retry(mock_task_func)
        
        # Should have been called exactly attempt_number times
        assert call_count == attempt_number
        
        # Final result should be positive
        assert result["sentiment"] == positive_sentiment
        assert result["task_id"] == f"task_{attempt_number}"
    
    @given(
        max_attempts=st.integers(min_value=1, max_value=5)
    )
    @settings(max_examples=20)
    def test_max_attempts_reached_raises_error(self, max_attempts):
        """
        **Feature: human-rpc-python-sdk, Property 15: Positive consensus termination**
        
        For any reiterator sequence that reaches max attempts without positive
        consensus, the system should raise ReiteratorMaxAttemptsError.
        """
        reiterator = ReiteratorManager(max_attempts=max_attempts, base_delay=0.01)
        
        call_count = 0
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            return {"sentiment": "negative", "task_id": f"task_{call_count}"}
        
        # Should raise exception after max_attempts
        with pytest.raises(ReiteratorMaxAttemptsError) as exc_info:
            reiterator.execute_with_retry(mock_task_func)
        
        # Should have been called exactly max_attempts times
        assert call_count == max_attempts
        
        # Exception should mention max attempts
        assert f"Maximum retry attempts ({max_attempts})" in str(exc_info.value)


class TestStatusMonitoringAccuracy:
    """Test reiterator status monitoring accuracy."""
    
    @given(
        max_attempts=st.integers(min_value=1, max_value=5),
        backoff_strategy=st.sampled_from(["exponential", "linear", "fixed"]),
        base_delay=st.floats(min_value=0.1, max_value=2.0)
    )
    @settings(max_examples=50)
    def test_status_reflects_configuration(self, max_attempts, backoff_strategy, base_delay):
        """
        **Feature: human-rpc-python-sdk, Property 16: Status monitoring accuracy**
        
        For any reiterator configuration, status queries should return accurate
        information about configuration parameters.
        """
        reiterator = ReiteratorManager(
            max_attempts=max_attempts,
            backoff_strategy=backoff_strategy,
            base_delay=base_delay
        )
        
        status = reiterator.get_status()
        
        # Configuration should be accurately reflected
        assert status["max_attempts"] == max_attempts
        assert status["backoff_strategy"] == backoff_strategy
        assert status["base_delay"] == base_delay
        
        # Initial state should be correct
        assert status["active"] is False
        assert status["attempt_count"] == 0
        assert status["total_retries_session"] == 0
        assert status["current_task_id"] is None
    
    def test_status_tracks_active_execution(self):
        """
        **Feature: human-rpc-python-sdk, Property 16: Status monitoring accuracy**
        
        For any active reiterator operation, status queries should return accurate
        information about current execution state.
        """
        reiterator = ReiteratorManager(max_attempts=5, base_delay=0.01)
        
        call_count = 0
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            
            # Return negative for first 2 calls, positive for 3rd
            if call_count < 3:
                return {"sentiment": "negative", "task_id": f"task_{call_count}"}
            else:
                return {"sentiment": "positive", "task_id": f"task_{call_count}"}
        
        # Execute with retry
        result = reiterator.execute_with_retry(mock_task_func)
        
        # Should have made 3 calls (2 negative + 1 positive)
        assert call_count == 3
        
        # Final status should show inactive state and correct retry count
        final_status = reiterator.get_status()
        assert final_status["active"] is False
        assert final_status["total_retries_session"] == 2  # 2 retries before success


class TestDynamicConfigurationChanges:
    """Test dynamic reiterator configuration changes."""
    
    def test_enable_disable_reiterator_preserves_state(self):
        """
        **Feature: human-rpc-python-sdk, Property 19: Dynamic configuration changes**
        
        For any dynamic reiterator configuration change, the system should apply
        changes to subsequent tasks while preserving ongoing iterations.
        """
        from human_rpc_sdk.agent import AutoAgent
        from unittest.mock import patch, Mock
        
        # Mock the wallet and other dependencies
        with patch('human_rpc_sdk.agent.WalletManager') as mock_wallet:
            mock_wallet.return_value.get_signer.return_value = Mock()
            mock_wallet.return_value.get_public_key.return_value = "test_key"
            
            # Create agent without reiterator initially
            agent = AutoAgent(
                solana_private_key="test_key",
                enable_session_management=False,
                reiterator=False
            )
            
            # Initially should not have reiterator
            status = agent.get_reiterator_status()
            assert status["enabled"] is False
            
            # Enable reiterator
            agent.enable_reiterator()
            
            # Should now be enabled
            status = agent.get_reiterator_status()
            assert status["enabled"] is True
            assert agent.reiterator is not None
            
            # Disable reiterator
            agent.disable_reiterator()
            
            # Should be disabled but reiterator object preserved
            status = agent.get_reiterator_status()
            assert status["enabled"] is False
            assert agent.reiterator is not None  # Object still exists
    
    def test_reiterator_initialization_with_custom_params(self):
        """
        **Feature: human-rpc-python-sdk, Property 19: Dynamic configuration changes**
        
        For any reiterator initialization parameters, the system should correctly
        configure the reiterator with the specified settings.
        """
        from human_rpc_sdk.agent import AutoAgent
        from unittest.mock import patch, Mock
        
        # Mock the wallet and other dependencies
        with patch('human_rpc_sdk.agent.WalletManager') as mock_wallet:
            mock_wallet.return_value.get_signer.return_value = Mock()
            mock_wallet.return_value.get_public_key.return_value = "test_key"
            
            # Create agent with custom reiterator configuration
            agent = AutoAgent(
                solana_private_key="test_key",
                enable_session_management=False,
                reiterator=True,
                max_retry_attempts=5,
                backoff_strategy="linear",
                base_delay=2.0
            )
            
            # Verify configuration
            status = agent.get_reiterator_status()
            assert status["enabled"] is True
            assert status["max_attempts"] == 5
            assert status["backoff_strategy"] == "linear"
            assert status["base_delay"] == 2.0


class TestMaximumAttemptsTermination:
    """Test maximum attempts termination behavior."""
    
    @given(
        max_attempts=st.integers(min_value=1, max_value=5)
    )
    @settings(max_examples=20)
    def test_max_attempts_termination_with_final_result(self, max_attempts):
        """
        **Feature: human-rpc-python-sdk, Property 17: Maximum attempts termination**
        
        For any reiterator sequence that reaches maximum retry attempts, the system
        should return the final negative result and stop retrying.
        """
        reiterator = ReiteratorManager(max_attempts=max_attempts, base_delay=0.01)
        
        call_count = 0
        final_result = {"sentiment": "negative", "decision": "reject"}
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            return final_result.copy()  # Always return negative result
        
        # Should raise ReiteratorMaxAttemptsError
        with pytest.raises(ReiteratorMaxAttemptsError) as exc_info:
            reiterator.execute_with_retry(mock_task_func)
        
        # Should have been called exactly max_attempts times
        assert call_count == max_attempts
        
        # Exception should contain the final result
        assert "Final result:" in str(exc_info.value)
        assert f"Maximum retry attempts ({max_attempts})" in str(exc_info.value)
    
    def test_termination_preserves_session_statistics(self):
        """
        **Feature: human-rpc-python-sdk, Property 17: Maximum attempts termination**
        
        For any termination due to max attempts, the system should preserve
        session statistics and reiterator state.
        """
        reiterator = ReiteratorManager(max_attempts=2, base_delay=0.01)
        
        def mock_task_func():
            return {"sentiment": "negative"}
        
        # First execution - should fail after 2 attempts
        with pytest.raises(ReiteratorMaxAttemptsError):
            reiterator.execute_with_retry(mock_task_func)
        
        # Check session statistics
        status = reiterator.get_status()
        assert status["total_retries_session"] == 2
        assert status["active"] is False
        
        # Reset and try again
        reiterator.reset()
        
        # Session statistics should be preserved, but current attempt reset
        status = reiterator.get_status()
        assert status["total_retries_session"] == 2  # Preserved
        assert status["attempt_count"] == 0  # Reset


class TestErrorHandlingDuringRetries:
    """Test error handling during retry attempts."""
    
    def test_api_errors_handled_gracefully(self):
        """
        **Feature: human-rpc-python-sdk, Property 18: Error handling during retries**
        
        For any API error encountered during retry attempts, the system should
        handle failures gracefully while continuing to respect rate limits.
        """
        reiterator = ReiteratorManager(max_attempts=3, base_delay=0.01)
        
        call_count = 0
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            
            # Always raise an exception to test error handling
            raise Exception("Simulated API error")
        
        # Should raise ReiteratorRateLimitError due to API error on final attempt
        with pytest.raises(ReiteratorRateLimitError) as exc_info:
            reiterator.execute_with_retry(mock_task_func)
        
        # Should have made exactly max_attempts calls
        assert call_count == 3
        
        # Should mention API error
        assert "API error" in str(exc_info.value)
    
    def test_rate_limiting_respected_during_errors(self):
        """
        **Feature: human-rpc-python-sdk, Property 18: Error handling during retries**
        
        For any sequence of API errors, the system should implement proper
        backoff delays to respect rate limiting.
        """
        reiterator = ReiteratorManager(max_attempts=3, base_delay=0.1)
        
        call_count = 0
        call_times = []
        
        def mock_task_func():
            nonlocal call_count
            call_count += 1
            call_times.append(time.time())
            
            # Always raise an exception to test error handling
            raise Exception("Persistent API error")
        
        start_time = time.time()
        
        # Should raise ReiteratorRateLimitError after max attempts
        with pytest.raises(ReiteratorRateLimitError):
            reiterator.execute_with_retry(mock_task_func)
        
        # Should have made exactly max_attempts calls
        assert call_count == 3
        
        # Should have proper delays between calls (allowing for some timing variance)
        if len(call_times) >= 2:
            delay1 = call_times[1] - call_times[0]
            assert delay1 >= 0.08  # Should be at least close to base_delay (0.1)
        
        if len(call_times) >= 3:
            delay2 = call_times[2] - call_times[1]
            assert delay2 >= 0.18  # Should be at least close to 2 * base_delay (0.2)


class TestDebugLoggingForRetries:
    """Test debug logging for retry attempts."""
    
    def test_logging_without_sensitive_information(self):
        """
        **Feature: human-rpc-python-sdk, Property 20: Debug logging for retries**
        
        For any reiterator operation with debug logging enabled, the system should
        generate appropriate log messages without exposing sensitive information.
        """
        import logging
        from io import StringIO
        
        # Set up logging capture
        log_stream = StringIO()
        handler = logging.StreamHandler(log_stream)
        logger = logging.getLogger('human_rpc_sdk.reiterator')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        
        try:
            reiterator = ReiteratorManager(max_attempts=3, base_delay=0.01)
            
            call_count = 0
            
            def mock_task_func():
                nonlocal call_count
                call_count += 1
                
                if call_count < 3:
                    return {"sentiment": "negative", "task_id": f"task_{call_count}"}
                else:
                    return {"sentiment": "positive", "task_id": f"task_{call_count}"}
            
            # Execute with retry
            result = reiterator.execute_with_retry(mock_task_func)
            
            # Get log output
            log_output = log_stream.getvalue()
            
            # Should contain retry information
            assert "Negative consensus" in log_output
            assert "Retrying in" in log_output
            assert "Positive consensus achieved" in log_output
            
            # Should not contain sensitive information (private keys, etc.)
            # This is a basic check - in a real implementation, you'd check for
            # specific patterns that shouldn't appear in logs
            assert "private_key" not in log_output.lower()
            assert "secret" not in log_output.lower()
            
        finally:
            # Clean up logging
            logger.removeHandler(handler)
    
    def test_logging_includes_attempt_information(self):
        """
        **Feature: human-rpc-python-sdk, Property 20: Debug logging for retries**
        
        For any retry sequence, debug logging should include attempt numbers
        and timing information for troubleshooting.
        """
        import logging
        from io import StringIO
        
        # Set up logging capture
        log_stream = StringIO()
        handler = logging.StreamHandler(log_stream)
        logger = logging.getLogger('human_rpc_sdk.reiterator')
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        
        try:
            reiterator = ReiteratorManager(max_attempts=2, base_delay=0.01)
            
            def mock_task_func():
                return {"sentiment": "negative"}
            
            # Should fail after max attempts
            with pytest.raises(ReiteratorMaxAttemptsError):
                reiterator.execute_with_retry(mock_task_func)
            
            # Get log output
            log_output = log_stream.getvalue()
            
            # Should contain attempt information
            assert "attempt 1" in log_output or "attempt 2" in log_output
            assert "Max attempts" in log_output
            
        finally:
            # Clean up logging
            logger.removeHandler(handler)