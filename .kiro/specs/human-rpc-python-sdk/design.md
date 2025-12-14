# Design Document

## Overview

The HumanRPC Python SDK provides a seamless integration layer for AI applications to leverage human-in-the-loop verification through automated cryptocurrency payments. The SDK consists of two primary components:

1. **AutoAgent**: An HTTP client that automatically handles 402 Payment Required responses by building, signing, and submitting Solana blockchain transactions
2. **@guard decorator**: A function decorator that wraps AI functions to automatically request human verification when confidence levels fall below configurable thresholds

The SDK abstracts away the complexity of blockchain transactions, invoice parsing, and payment flows, allowing developers to focus on their AI application logic while seamlessly integrating human oversight capabilities.

## Architecture

The SDK follows a modular architecture with clear separation of concerns:

```
human_rpc_sdk/
├── __init__.py          # Public API exports
├── agent.py             # AutoAgent HTTP client
├── decorator.py         # @guard decorator implementation  
├── solana_utils.py      # Transaction building and signing
├── invoices.py          # Invoice parsing and validation
├── exceptions.py        # Custom exception classes
├── wallet.py            # Wallet management and key handling
└── reiterator.py        # Reiterator logic and retry management
```

### Component Interactions

```mermaid
graph TD
    A[AI Application] --> B[@guard Decorator]
    A --> C[AutoAgent]
    B --> C
    C --> D[Invoice Parser]
    C --> E[Solana Utils]
    C --> F[Wallet Manager]
    C --> K[Reiterator]
    E --> F
    D --> G[Payment Validation]
    E --> H[Transaction Builder]
    H --> I[Solana Network]
    C --> J[HumanRPC API]
    K --> J
    J --> K
```

## Components and Interfaces

### AutoAgent Class

The main HTTP client that handles automatic payment processing and optional reiterator functionality:

```python
class AutoAgent:
    def __init__(self, 
                 solana_private_key: Optional[str] = None,
                 rpc_url: Optional[str] = None, 
                 human_rpc_url: Optional[str] = None,
                 network: str = "devnet",
                 timeout: int = 10,
                 reiterator: bool = False,
                 max_retry_attempts: int = 3,
                 backoff_strategy: str = "exponential",
                 base_delay: float = 1.0)
    
    def get(self, url: str, headers: dict = None, **kwargs) -> requests.Response
    def post(self, url: str, json: dict = None, **kwargs) -> requests.Response  
    def request(self, method: str, url: str, **kwargs) -> requests.Response
    def ask_human_rpc(self, text: str, **kwargs) -> dict
    def enable_reiterator(self) -> None
    def disable_reiterator(self) -> None
    def get_reiterator_status(self) -> dict
```

### Guard Decorator

Function decorator for automatic human verification:

```python
def guard(threshold: float = 0.9, 
          agent_id: Optional[str] = None,
          reward: Optional[str] = None,
          timeout: int = 300) -> callable
```

### Solana Utilities

Transaction building and signing functions:

```python
def build_sol_transfer(sender_keypair, recipient_pubkey, lamports, recent_blockhash) -> Transaction
def build_spl_transfer(sender_keypair, recipient_pubkey, mint_pubkey, amount, rpc_url) -> Transaction  
def sign_and_serialize_transaction(transaction, keypair) -> str
```

### Invoice Parser

Invoice validation and parsing:

```python
class Invoice:
    def __init__(self, data: dict)
    def validate(self) -> None
    def get_amount_lamports(self) -> int
    def get_recipient(self) -> str
    def get_currency(self) -> str
```

### Reiterator Manager

Automatic retry logic for negative consensus outcomes:

```python
class ReiteratorManager:
    def __init__(self, 
                 max_attempts: int = 3,
                 backoff_strategy: str = "exponential", 
                 base_delay: float = 1.0,
                 max_delay: float = 60.0)
    
    def should_retry(self, result: dict, attempt_count: int) -> bool
    def calculate_delay(self, attempt_count: int) -> float
    def execute_with_retry(self, task_func: callable, *args, **kwargs) -> dict
    def get_status(self) -> dict
    def reset(self) -> None
```

## Data Models

### Invoice Structure

```python
{
    "status": "payment_required",
    "invoice": {
        "amount": 0.05,
        "currency": "USDC",  # or "SOL"
        "mint": "TOKEN_MINT_ADDRESS",  # optional for SPL tokens
        "recipient": "ESCROW_PUBKEY",
        "reference": "optional-ref-hex",
        "network": "devnet"
    },
    "message": "0.05 USDC required to unlock content"
}
```

### Payment Header Format

```python
{
    "x402Version": 1,
    "scheme": "solana", 
    "network": "devnet",
    "payload": {
        "serializedTransaction": "base64_encoded_transaction"
    }
}
```

### Guard Decorator Response

```python
{
    "answer": "original_ai_response",
    "confidence": 0.65,
    "human_verdict": {
        "decision": "approve",
        "confidence": 0.95,
        "comment": "Human feedback"
    }
}
```

### Reiterator Configuration

```python
{
    "enabled": True,
    "max_attempts": 3,
    "backoff_strategy": "exponential",  # or "linear", "fixed"
    "base_delay": 1.0,
    "max_delay": 60.0,
    "current_attempt": 0,
    "total_retries": 0,
    "last_retry_time": "2024-01-01T12:00:00Z"
}
```

### Reiterator Status Response

```python
{
    "active": True,
    "current_task_id": "task_123",
    "attempt_count": 2,
    "max_attempts": 3,
    "next_retry_time": "2024-01-01T12:02:00Z",
    "total_retries_session": 5,
    "last_result": "negative"
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After reviewing all properties identified in the prework, several redundancies were identified:

- Properties 2.1-2.5 can be consolidated into comprehensive request handling properties
- Properties 3.1-3.5 can be combined into transaction building properties  
- Properties 5.1-5.5 represent different aspects of error handling that should be tested separately
- Properties 4.1-4.5 cover the complete guard decorator workflow and should remain separate

The following properties eliminate redundancy while maintaining comprehensive coverage:

**Property 1: Configuration validation**
*For any* SDK initialization parameters, invalid configurations should raise descriptive errors while valid configurations should initialize successfully
**Validates: Requirements 1.3, 1.4, 1.5**

**Property 2: HTTP request pass-through**  
*For any* HTTP request that returns non-402 status, AutoAgent should return the response without modification
**Validates: Requirements 2.1**

**Property 3: Invoice parsing and validation**
*For any* 402 response containing invoice data, the system should successfully parse valid invoices and reject invalid ones with descriptive errors
**Validates: Requirements 2.2, 2.3**

**Property 4: Transaction building correctness**
*For any* valid invoice, the system should build a correctly formatted Solana transaction that transfers the specified amount to the correct recipient
**Validates: Requirements 2.4, 3.1, 3.2, 3.3, 3.4**

**Property 5: Payment retry mechanism**
*For any* successfully built transaction, the system should serialize it to base64, add the X-PAYMENT header, and retry the original request
**Validates: Requirements 2.5**

**Property 6: Guard decorator threshold behavior**
*For any* function decorated with @guard, results with confidence above threshold should return immediately while results below threshold should trigger human verification
**Validates: Requirements 4.1, 4.2**

**Property 7: Human verification integration**
*For any* guard decorator triggering human verification, the system should call HumanRPC API, wait for verdict, and combine results appropriately
**Validates: Requirements 4.3, 4.4**

**Property 8: Error handling consistency**
*For any* error condition (invalid keys, malformed invoices, RPC failures, payment failures), the system should raise SDK-specific exceptions with descriptive messages
**Validates: Requirements 5.1, 5.2, 5.3, 5.4**

**Property 9: Security and logging**
*For any* logging or error output, the system should never expose private keys or sensitive cryptographic material
**Validates: Requirements 5.5**

**Property 10: Transaction serialization round-trip**
*For any* valid transaction built by the SDK, serializing then deserializing should produce an equivalent transaction structure
**Validates: Requirements 2.4, 2.5**

**Property 11: Reiterator configuration validation**
*For any* reiterator configuration parameters, the system should accept valid configurations and reject invalid ones with descriptive error messages
**Validates: Requirements 9.1, 10.1**

**Property 12: Negative consensus retry trigger**
*For any* human-RPC task that completes with negative consensus, the reiterator should automatically trigger when enabled and remain inactive when disabled
**Validates: Requirements 9.2**

**Property 13: Rate limiting and backoff behavior**
*For any* sequence of retry attempts, the system should implement proper exponential backoff with delays that increase according to the configured strategy
**Validates: Requirements 9.3**

**Property 14: Parameter preservation during retries**
*For any* retry attempt, the new task submission should contain identical parameters to the original request
**Validates: Requirements 9.4**

**Property 15: Positive consensus termination**
*For any* reiterator sequence that achieves positive consensus, the system should return the successful result and stop further retry attempts
**Validates: Requirements 9.5**

**Property 16: Status monitoring accuracy**
*For any* reiterator operation, status queries should return accurate information about current iteration count, active state, and configuration
**Validates: Requirements 10.2**

**Property 17: Maximum attempts termination**
*For any* reiterator sequence that reaches maximum retry attempts, the system should return the final negative result and stop retrying
**Validates: Requirements 10.3**

**Property 18: Error handling during retries**
*For any* API error encountered during retry attempts, the system should handle failures gracefully while continuing to respect rate limits
**Validates: Requirements 10.4**

**Property 19: Dynamic configuration changes**
*For any* dynamic reiterator configuration change, the system should apply changes to subsequent tasks while preserving ongoing iterations
**Validates: Requirements 10.5**

**Property 20: Debug logging for retries**
*For any* reiterator operation with debug logging enabled, the system should generate appropriate log messages without exposing sensitive information
**Validates: Requirements 11.5**

## Error Handling

The SDK implements comprehensive error handling with custom exception classes:

- `SDKConfigurationError`: Invalid configuration or missing environment variables
- `InvoiceValidationError`: Malformed or invalid invoice data
- `TransactionBuildError`: Failures in transaction construction
- `PaymentError`: Payment processing failures (insufficient funds, network issues)
- `HumanVerificationError`: Human RPC API failures or timeouts
- `ReiteratorConfigurationError`: Invalid reiterator configuration parameters
- `ReiteratorMaxAttemptsError`: Maximum retry attempts reached without positive consensus
- `ReiteratorRateLimitError`: Rate limiting violations during retry attempts

All exceptions include descriptive messages and preserve original error context where appropriate.

## Testing Strategy

### Dual Testing Approach

The SDK employs both unit testing and property-based testing for comprehensive coverage:

**Unit Tests:**
- Specific examples demonstrating correct behavior
- Integration points between components  
- Edge cases and error conditions
- Example bot functionality

**Property-Based Tests:**
- Universal properties that should hold across all inputs
- Transaction building correctness across various invoice types
- Error handling consistency across different failure modes
- Configuration validation across parameter combinations

**Property-Based Testing Library:** The implementation will use Hypothesis for Python, configured to run a minimum of 100 iterations per property test.

**Test Tagging:** Each property-based test will include a comment explicitly referencing the design document property using the format: `**Feature: human-rpc-python-sdk, Property {number}: {property_text}**`

### Integration Testing

A local gateway stub (Flask/FastAPI) will simulate the complete 402 payment flow:
- Return 402 responses with valid invoices
- Validate X-PAYMENT headers contain properly signed transactions
- Return unlocked content after successful payment verification
- Support both SOL and USDC payment scenarios

### Test Environment

- Use deterministic test keypairs to avoid randomness
- Mock Solana RPC calls where appropriate for unit tests
- Use devnet for integration tests requiring real blockchain interaction
- Validate transaction structure without broadcasting to mainnet