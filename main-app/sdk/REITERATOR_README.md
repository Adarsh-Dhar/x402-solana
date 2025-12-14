# Reiterator Functionality

The HumanRPC SDK includes an optional **reiterator** feature that automatically retries human-RPC tasks when consensus results are negative, continuing until a positive consensus is achieved or maximum attempts are reached.

## Quick Start

### Enable During Initialization

```python
from human_rpc_sdk import AutoAgent

# Initialize with reiterator enabled
agent = AutoAgent(
    solana_private_key="your_private_key",
    reiterator=True,                    # Enable automatic retry
    max_retry_attempts=3,               # Maximum retry attempts
    backoff_strategy="exponential",     # Backoff strategy
    base_delay=1.0                      # Base delay in seconds
)
```

### Dynamic Enable/Disable

```python
# Enable reiterator at runtime
agent.enable_reiterator()

# Disable reiterator
agent.disable_reiterator()

# Check status
status = agent.get_reiterator_status()
print(f"Enabled: {status['enabled']}")
```

## Configuration Options

### Backoff Strategies

- **`exponential`** (default): Delay doubles with each attempt (1s, 2s, 4s, 8s...)
- **`linear`**: Delay increases linearly (1s, 2s, 3s, 4s...)  
- **`fixed`**: Constant delay between attempts (1s, 1s, 1s, 1s...)

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `reiterator` | bool | `False` | Enable automatic retry functionality |
| `max_retry_attempts` | int | `3` | Maximum number of retry attempts |
| `backoff_strategy` | str | `"exponential"` | Delay calculation strategy |
| `base_delay` | float | `1.0` | Base delay in seconds |

## Usage Examples

### Basic Usage

```python
# The reiterator works automatically with existing code
result = agent.ask_human_rpc(
    text="Analyze this sentiment: 'This product is terrible'",
    context=context_data
)

# If consensus is negative, reiterator will automatically retry
# until positive consensus or max attempts reached
```

### Status Monitoring

```python
# Get detailed status information
status = agent.get_reiterator_status()

print(f"Active: {status['active']}")
print(f"Current attempt: {status['attempt_count']}")
print(f"Max attempts: {status['max_attempts']}")
print(f"Total retries this session: {status['total_retries_session']}")
print(f"Backoff strategy: {status['backoff_strategy']}")
```

### Configuration Examples

```python
# Conservative configuration (fewer retries, longer delays)
conservative_agent = AutoAgent(
    reiterator=True,
    max_retry_attempts=2,
    backoff_strategy="linear",
    base_delay=2.0
)

# Aggressive configuration (more retries, shorter delays)
aggressive_agent = AutoAgent(
    reiterator=True,
    max_retry_attempts=5,
    backoff_strategy="exponential", 
    base_delay=0.5
)

# Fixed delay configuration (predictable timing)
fixed_agent = AutoAgent(
    reiterator=True,
    max_retry_attempts=3,
    backoff_strategy="fixed",
    base_delay=1.5
)
```

## How It Works

1. **Negative Consensus Detection**: Reiterator automatically detects negative consensus results based on:
   - `sentiment`: "negative", "reject", "disapprove", "deny", "refuse"
   - `decision`: "reject", "deny", "disapprove", "negative", "no"
   - `approved`: `false`
   - `consensus`: "negative"

2. **Automatic Retry**: When negative consensus is detected:
   - Calculates delay based on backoff strategy
   - Waits for the calculated delay
   - Resubmits the task with identical parameters
   - Continues until positive consensus or max attempts reached

3. **Termination Conditions**:
   - **Positive consensus achieved**: Returns successful result
   - **Max attempts reached**: Raises `ReiteratorMaxAttemptsError`
   - **API errors**: Raises `ReiteratorRateLimitError`

## Error Handling

The reiterator includes comprehensive error handling:

```python
from human_rpc_sdk import (
    ReiteratorConfigurationError,
    ReiteratorMaxAttemptsError, 
    ReiteratorRateLimitError
)

try:
    result = agent.ask_human_rpc(text="...", context=context)
except ReiteratorMaxAttemptsError as e:
    print(f"Max attempts reached: {e}")
except ReiteratorRateLimitError as e:
    print(f"Rate limiting error: {e}")
except ReiteratorConfigurationError as e:
    print(f"Configuration error: {e}")
```

## Important Considerations

### ⚠️ Cost Implications

- **Each retry incurs additional costs** for human verification
- **Total cost = base_cost × number_of_attempts**
- Monitor usage and set appropriate `max_retry_attempts`
- Consider implementing cost limits in your application

### ⏱️ Timing Considerations

Exponential backoff can lead to significant delays:

```
Base delay: 1.0s, Strategy: exponential
- Attempt 1: immediate
- Attempt 2: ~1s delay  
- Attempt 3: ~2s delay
- Attempt 4: ~4s delay
- Total time: ~7+ seconds
```

### 🎯 Best Practices

1. **Start Conservative**: Begin with `max_retry_attempts=2-3`
2. **Monitor Costs**: Track retry frequency and associated costs
3. **Use Linear Backoff**: For predictable timing requirements
4. **Test Thoroughly**: Use mock scenarios before production
5. **Set Reasonable Limits**: Balance success rate vs. cost/time
6. **Monitor Status**: Use `get_reiterator_status()` for insights

## Rate Limiting

The reiterator respects rate limits and implements proper backoff:

- **Exponential backoff** for API errors
- **Configurable delays** between retry attempts  
- **Graceful error handling** for rate limit violations
- **Automatic termination** when limits are exceeded

## Examples

See the `examples/` directory for complete working examples:

- `examples/reiterator_example.py` - Basic reiterator usage
- `examples/dynamic_reiterator.py` - Dynamic control and monitoring

## Advanced Usage

### Custom Reiterator Manager

```python
from human_rpc_sdk import ReiteratorManager

# Create custom reiterator with specific settings
reiterator = ReiteratorManager(
    max_attempts=5,
    backoff_strategy="linear",
    base_delay=0.5,
    max_delay=10.0
)

# Use with custom task function
def my_task():
    # Your task logic here
    return {"sentiment": "negative"}  # Will trigger retry

try:
    result = reiterator.execute_with_retry(my_task)
except ReiteratorMaxAttemptsError:
    print("All retry attempts exhausted")
```

### Status Monitoring During Execution

```python
import threading
import time

def monitor_reiterator(agent):
    """Monitor reiterator status during execution."""
    while True:
        status = agent.get_reiterator_status()
        if status['active']:
            print(f"Retry attempt {status['attempt_count']}/{status['max_attempts']}")
        time.sleep(1)

# Start monitoring in background
monitor_thread = threading.Thread(target=monitor_reiterator, args=(agent,))
monitor_thread.daemon = True
monitor_thread.start()

# Execute task with monitoring
result = agent.ask_human_rpc(text="...", context=context)
```

## Troubleshooting

### Common Issues

1. **High Retry Rates**: 
   - Review task quality and clarity
   - Consider adjusting confidence thresholds
   - Monitor human feedback patterns

2. **Excessive Delays**:
   - Switch to linear or fixed backoff strategy
   - Reduce `base_delay` parameter
   - Lower `max_retry_attempts`

3. **Cost Overruns**:
   - Implement application-level cost tracking
   - Set lower `max_retry_attempts`
   - Monitor `total_retries_session` statistics

4. **Rate Limiting**:
   - Increase `base_delay` to reduce request frequency
   - Monitor API error patterns
   - Implement exponential backoff for errors

### Debug Logging

Enable debug logging to troubleshoot issues:

```python
import logging

# Enable debug logging for reiterator
logging.getLogger('human_rpc_sdk.reiterator').setLevel(logging.DEBUG)

# Your reiterator usage here
```

## Migration Guide

### From Non-Reiterator Code

Existing code works without changes:

```python
# Before (no reiterator)
agent = AutoAgent(solana_private_key="key")
result = agent.ask_human_rpc(text="...", context=context)

# After (with reiterator) - same code, automatic retries
agent = AutoAgent(solana_private_key="key", reiterator=True)
result = agent.ask_human_rpc(text="...", context=context)  # Now retries automatically
```

### Gradual Adoption

1. **Start with monitoring**: Enable reiterator but set `max_retry_attempts=1`
2. **Analyze patterns**: Monitor negative consensus rates
3. **Increase gradually**: Raise `max_retry_attempts` based on success patterns
4. **Optimize settings**: Adjust backoff strategy and delays based on usage

---

For more examples and detailed API documentation, see the main SDK documentation.