# HumanRPC Python SDK Integration Guide

This guide will help you integrate the HumanRPC Python SDK into your AI applications to add human-in-the-loop verification capabilities with automatic Solana payments.

## Installation

```bash
pip install human-rpc-sdk
```

## Quick Start

### 1. Set up your Solana wallet

First, you need a Solana private key for payments. Set it as an environment variable:

```bash
export SOLANA_PRIVATE_KEY="your_base58_encoded_private_key_here"
```

**Important**: Make sure your wallet has sufficient SOL or USDC for payments on the network you're using (devnet for testing, mainnet for production).

### 2. Basic AutoAgent Usage

The `AutoAgent` automatically handles 402 Payment Required responses by building and signing Solana transactions:

```python
from human_rpc_sdk import AutoAgent

# Initialize with custom defaults for your agent
agent = AutoAgent(
    network="devnet",  # or "mainnet-beta" for production
    default_agent_name="MyAI-Agent",
    default_reward="0.5 USDC",
    default_reward_amount=0.5,
    default_category="Analysis",
    default_escrow_amount="1.0 USDC"
)

# Make HTTP requests that automatically handle payments
response = agent.get("https://api.example.com/protected-endpoint")
print(response.json())
```

### 3. Using the @guard Decorator

The `@guard` decorator automatically requests human verification when AI confidence is low:

```python
from human_rpc_sdk import guard

@guard(
    threshold=0.8,  # Request human verification if confidence < 0.8
    agent_id="SentimentAnalyzer",
    reward="0.3 USDC",
    reward_amount=0.3,
    category="Sentiment Analysis",
    escrow_amount="0.6 USDC"
)
def analyze_sentiment(text: str) -> dict:
    # Your AI analysis logic here
    confidence = calculate_confidence(text)  # Your confidence calculation
    sentiment = determine_sentiment(text)    # Your sentiment analysis
    
    return {
        "answer": sentiment,
        "confidence": confidence,
        "reasoning": "Analysis based on keyword patterns and context"
    }

# Usage
result = analyze_sentiment("This product is amazing but the delivery was slow")
print(result)
# If confidence < 0.8, this will automatically request human verification
```

### 4. Direct Human Verification

You can also directly request human verification:

```python
from human_rpc_sdk import AutoAgent

agent = AutoAgent(
    default_agent_name="MyCustomAgent",
    default_reward="0.4 USDC",
    default_reward_amount=0.4
)

# Prepare context for human verification
context = {
    "type": "sentiment_analysis",
    "summary": "Verify AI sentiment classification",
    "data": {
        "userQuery": "The product is okay I guess",
        "agentConclusion": "NEUTRAL",
        "confidence": 0.65,
        "reasoning": "Mixed signals in the text"
    }
}

# Request human verification (uses your configured defaults)
result = agent.ask_human_rpc(
    text="The product is okay I guess",
    context=context
)
print(result)
```

## Configuration Options

### AutoAgent Constructor Parameters

```python
agent = AutoAgent(
    solana_private_key="optional_key_override",  # Overrides env var
    rpc_url="https://api.devnet.solana.com",     # Custom RPC endpoint
    human_rpc_url="https://your-api.com/tasks",  # Custom HumanRPC endpoint
    network="devnet",                            # "devnet" or "mainnet-beta"
    timeout=30,                                  # HTTP timeout in seconds
    
    # Your configurable defaults
    default_agent_name="YourAgentName",          # Default agent identifier
    default_reward="0.5 USDC",                   # Default reward amount string
    default_reward_amount=0.5,                   # Default reward amount float
    default_category="YourCategory",             # Default task category
    default_escrow_amount="1.0 USDC"             # Default escrow amount
)
```

### @guard Decorator Parameters

```python
@guard(
    threshold=0.85,                    # Confidence threshold (0.0-1.0)
    agent_id="YourAgentID",           # Agent identifier
    reward="0.3 USDC",                # Reward amount string
    reward_amount=0.3,                # Reward amount float
    category="Verification",          # Task category
    escrow_amount="0.6 USDC",         # Escrow amount string
    timeout=300,                      # Timeout in seconds
    fallback_on_error=True            # Return original result on error
)
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SOLANA_PRIVATE_KEY` | Base58-encoded Solana private key (required) | None |
| `SOLANA_RPC_URL` | Global RPC URL override | Network-specific default |
| `SOLANA_DEVNET_RPC_URL` | Devnet RPC URL | `https://api.devnet.solana.com` |
| `SOLANA_MAINNET_RPC_URL` | Mainnet RPC URL | `https://api.mainnet-beta.solana.com` |
| `HUMAN_RPC_URL` | HumanRPC API endpoint | `http://localhost:3000/api/v1/tasks` |

## Payment Configuration

### Supported Currencies

- **SOL**: Native Solana token
- **USDC**: USD Coin (SPL token)

### Payment Amounts

Configure payment amounts based on your use case:

- **Low-stakes verification**: 0.1-0.3 USDC
- **Medium-stakes analysis**: 0.3-0.8 USDC  
- **High-stakes decisions**: 0.8-2.0 USDC

### Escrow Amounts

Escrow should typically be 2x the reward amount to ensure proper incentives.

## Error Handling

The SDK provides specific exception types for different error conditions:

```python
from human_rpc_sdk import (
    SDKConfigurationError,
    InvoiceValidationError,
    TransactionBuildError,
    PaymentError,
    HumanVerificationError
)

try:
    result = agent.ask_human_rpc(text="Analyze this", context=context)
except SDKConfigurationError as e:
    print(f"Configuration error: {e}")
except PaymentError as e:
    print(f"Payment failed: {e}")
except HumanVerificationError as e:
    print(f"Human verification failed: {e}")
```

## Best Practices

### 1. Wallet Security

- Never commit private keys to version control
- Use environment variables or secure key management
- Use devnet for testing, mainnet for production
- Monitor your wallet balance regularly

### 2. Confidence Thresholds

- Start with higher thresholds (0.9+) and adjust based on results
- Different tasks may need different thresholds
- Consider the cost vs. accuracy trade-off

### 3. Context Preparation

Always provide rich context for human verifiers:

```python
context = {
    "type": "task_type",
    "summary": "Brief description of what needs verification",
    "data": {
        "userQuery": "Original user input",
        "agentConclusion": "Your AI's conclusion",
        "confidence": 0.75,
        "reasoning": "Detailed reasoning for the conclusion"
    }
}
```

### 4. Error Handling

- Always handle payment errors gracefully
- Provide fallback behavior when human verification fails
- Log errors for debugging but never log private keys

### 5. Testing

- Test with small amounts on devnet first
- Verify your wallet has sufficient funds
- Test both high and low confidence scenarios

## Example: Complete Sentiment Analysis Agent

```python
from human_rpc_sdk import AutoAgent, guard
import os

# Configure your agent
agent = AutoAgent(
    network="devnet",
    default_agent_name="SentimentBot-v1",
    default_reward="0.25 USDC",
    default_reward_amount=0.25,
    default_category="Sentiment Analysis",
    default_escrow_amount="0.5 USDC"
)

@guard(
    threshold=0.8,
    agent_id="SentimentBot-v1",
    reward="0.25 USDC",
    reward_amount=0.25,
    category="Sentiment Analysis",
    escrow_amount="0.5 USDC"
)
def analyze_text_sentiment(text: str) -> dict:
    """Analyze sentiment with automatic human verification for low confidence."""
    
    # Your AI logic here
    sentiment_score = your_ai_model.predict(text)
    
    if sentiment_score > 0.1:
        sentiment = "POSITIVE"
        confidence = min(0.95, 0.7 + abs(sentiment_score))
    elif sentiment_score < -0.1:
        sentiment = "NEGATIVE" 
        confidence = min(0.95, 0.7 + abs(sentiment_score))
    else:
        sentiment = "NEUTRAL"
        confidence = 0.6  # Lower confidence for neutral cases
    
    return {
        "answer": sentiment,
        "confidence": confidence,
        "reasoning": f"Sentiment score: {sentiment_score:.3f}, classified as {sentiment}"
    }

# Usage
if __name__ == "__main__":
    # Make sure SOLANA_PRIVATE_KEY is set
    if not os.getenv("SOLANA_PRIVATE_KEY"):
        print("Please set SOLANA_PRIVATE_KEY environment variable")
        exit(1)
    
    # Test with different confidence levels
    test_cases = [
        "This product is absolutely amazing!",  # High confidence
        "It's okay I guess",                    # Low confidence -> human verification
        "Terrible experience, would not recommend"  # High confidence
    ]
    
    for text in test_cases:
        print(f"\\nAnalyzing: '{text}'")
        try:
            result = analyze_text_sentiment(text)
            print(f"Result: {result}")
        except Exception as e:
            print(f"Error: {e}")
```

## Support

For issues and questions:

1. Check the error messages - they provide specific guidance
2. Verify your wallet has sufficient funds
3. Ensure you're using the correct network (devnet vs mainnet)
4. Check the [GitHub repository](https://github.com/yourusername/human-rpc-sdk) for examples

## Security Notes

- Private keys are never logged or exposed in error messages
- All payments are made on-chain and verifiable
- The SDK only handles payment transactions, not fund storage
- Always use HTTPS endpoints in production