# Requirements Document

## Introduction

The HumanRPC Python SDK provides developers with a seamless way to integrate human-in-the-loop functionality into their AI applications. The SDK consists of two main components: AutoAgent, an HTTP client that automatically handles payment-required responses by building and signing Solana transactions, and the @guard decorator that wraps AI functions to request human verification when confidence is low.

## Glossary

- **AutoAgent**: HTTP client class that automatically handles 402 Payment Required responses by creating and signing Solana transactions
- **Guard_Decorator**: Python decorator that wraps AI functions to request human verification when confidence falls below threshold
- **Invoice**: JSON structure returned in 402 responses containing payment details (amount, currency, recipient, reference)
- **Solana_Transaction**: Blockchain transaction for transferring SOL or SPL tokens to escrow accounts
- **Human_Verdict**: Response from human evaluator containing decision and confidence level
- **Payment_Header**: X-PAYMENT HTTP header containing base64-encoded signed Solana transaction
- **Confidence_Threshold**: Minimum confidence level (0.0-1.0) required to bypass human verification
- **Escrow_Account**: Solana account that receives payments for human verification services
- **SPL_Token**: Solana Program Library token (e.g., USDC) used for payments
- **Gateway_Stub**: Local test server that simulates 402 payment flow for integration testing
- **Reiterator**: Optional SDK feature that automatically retries human-RPC tasks when consensus results are negative
- **Negative_Consensus**: Human verification result indicating rejection or disapproval of the AI agent's output
- **Positive_Consensus**: Human verification result indicating approval or acceptance of the AI agent's output
- **Retry_Attempt**: Automatic resubmission of a human-RPC task triggered by reiterator functionality
- **Backoff_Strategy**: Time delay mechanism between retry attempts to respect rate limits and avoid system overload
- **Iteration_Count**: Number of retry attempts made by reiterator for a specific task

## Requirements

### Requirement 1

**User Story:** As a Python developer, I want to install and import the HumanRPC SDK, so that I can integrate human-in-the-loop functionality into my applications.

#### Acceptance Criteria

1. WHEN a developer runs `pip install human-rpc-sdk` THEN the SDK_Package SHALL install successfully with all dependencies
2. WHEN a developer imports the SDK THEN the system SHALL provide access to AutoAgent class and guard decorator
3. WHEN the SDK is imported THEN the system SHALL read configuration from environment variables or constructor parameters
4. WHEN invalid configuration is provided THEN the system SHALL raise descriptive error messages
5. WHEN the SDK initializes THEN the system SHALL validate Solana private key format and network connectivity

### Requirement 2

**User Story:** As a developer, I want AutoAgent to automatically handle payment-required responses, so that my HTTP requests can seamlessly unlock protected content.

#### Acceptance Criteria

1. WHEN AutoAgent makes an HTTP request that returns 200 status THEN the system SHALL return the response without modification
2. WHEN AutoAgent receives a 402 Payment Required response THEN the system SHALL parse the invoice from the response body
3. WHEN an invoice is parsed THEN the system SHALL validate required fields including amount, currency, and recipient
4. WHEN invoice validation succeeds THEN the system SHALL build and sign a Solana transaction for the specified amount
5. WHEN a transaction is signed THEN the system SHALL serialize it to base64 and add X-PAYMENT header to retry the request

### Requirement 3

**User Story:** As a developer, I want to build Solana transactions for both SOL and SPL token payments, so that I can pay for services using different cryptocurrencies.

#### Acceptance Criteria

1. WHEN an invoice specifies SOL currency THEN the system SHALL create a SOL transfer transaction to the recipient address
2. WHEN an invoice specifies USDC or other SPL token THEN the system SHALL create an SPL token transfer transaction
3. WHEN building SPL transactions THEN the system SHALL handle associated token account creation if necessary
4. WHEN a transaction includes a reference THEN the system SHALL append the reference as a public key for server-side lookup
5. WHEN transaction building fails THEN the system SHALL raise descriptive exceptions with error details

### Requirement 4

**User Story:** As a developer, I want to use the @guard decorator on AI functions, so that low-confidence responses trigger human verification automatically.

#### Acceptance Criteria

1. WHEN a function decorated with @guard returns confidence above threshold THEN the system SHALL return the result without human intervention
2. WHEN a function decorated with @guard returns confidence below threshold THEN the system SHALL pause execution and request human verification
3. WHEN human verification is requested THEN the system SHALL call the HumanRPC API using AutoAgent to create a paid task
4. WHEN human verdict is received THEN the system SHALL combine the original result with human feedback and return to caller
5. WHEN human verification times out THEN the system SHALL handle the timeout according to configured fallback behavior

### Requirement 5

**User Story:** As a developer, I want comprehensive error handling and logging, so that I can debug issues and handle failures gracefully.

#### Acceptance Criteria

1. WHEN Solana private key is missing or invalid THEN the system SHALL raise a descriptive authentication error
2. WHEN invoice parsing fails due to malformed JSON THEN the system SHALL raise an invoice validation error
3. WHEN Solana RPC calls fail THEN the system SHALL wrap low-level exceptions in SDK-specific exceptions
4. WHEN payment transactions fail THEN the system SHALL provide clear error messages about insufficient funds or network issues
5. WHEN debug mode is enabled THEN the system SHALL log transaction details without exposing private keys

### Requirement 6

**User Story:** As a developer, I want to test the SDK locally without real payments, so that I can develop and validate my integration safely.

#### Acceptance Criteria

1. WHEN running integration tests THEN the system SHALL use a local gateway stub that simulates 402 payment flow
2. WHEN the gateway stub receives a request THEN the system SHALL return a 402 response with a valid invoice structure
3. WHEN the gateway stub receives a retry with X-PAYMENT header THEN the system SHALL validate the transaction and return unlocked content
4. WHEN transaction validation succeeds THEN the system SHALL verify the payment amount and recipient match the invoice
5. WHEN integration tests complete THEN the system SHALL demonstrate end-to-end payment flow without broadcasting real transactions

### Requirement 7

**User Story:** As a developer, I want example implementations and documentation, so that I can quickly understand how to use the SDK effectively.

#### Acceptance Criteria

1. WHEN developers access the SDK repository THEN the system SHALL provide example bots demonstrating AutoAgent usage
2. WHEN developers review examples THEN the system SHALL include @guard decorator usage with different confidence thresholds
3. WHEN developers read documentation THEN the system SHALL explain environment variable configuration and setup steps
4. WHEN developers run examples THEN the system SHALL work with the provided local gateway stub
5. WHEN developers package the SDK THEN the system SHALL build successfully into a pip-installable artifact

### Requirement 8

**User Story:** As a developer, I want automated testing and CI/CD, so that the SDK maintains quality and reliability across changes.

#### Acceptance Criteria

1. WHEN code is pushed to the repository THEN the system SHALL run all unit tests automatically via GitHub Actions
2. WHEN unit tests execute THEN the system SHALL test invoice parsing, transaction building, and AutoAgent request handling
3. WHEN integration tests run THEN the system SHALL validate end-to-end payment flow using the gateway stub
4. WHEN tests include Solana operations THEN the system SHALL use deterministic test keypairs to avoid randomness
5. WHEN CI pipeline completes THEN the system SHALL report test results and build status clearly

### Requirement 9

**User Story:** As a developer, I want to enable automatic reiterator functionality in my agent, so that my agent can automatically retry human-RPC tasks when consensus results are negative.

#### Acceptance Criteria

1. WHEN initializing AutoAgent with reiterator enabled THEN the system SHALL accept a reiterator configuration parameter
2. WHEN a human-RPC task completes with negative consensus THEN the system SHALL automatically trigger reiterator logic if enabled
3. WHEN reiterator is triggered THEN the system SHALL respect rate limits and implement exponential backoff between retry attempts
4. WHEN reiterator submits a retry THEN the system SHALL create a new task submission using the same parameters as the original request
5. WHEN reiterator achieves positive consensus THEN the system SHALL return the successful result and stop retrying

### Requirement 10

**User Story:** As a developer, I want to configure and monitor reiterator behavior, so that I can control retry logic and track iteration progress.

#### Acceptance Criteria

1. WHEN reiterator is configured THEN the system SHALL accept parameters for maximum retry attempts and backoff strategy
2. WHEN reiterator is active THEN the system SHALL provide methods to check reiterator status and current iteration count
3. WHEN maximum retry attempts are reached THEN the system SHALL return the final negative result and disable further retries
4. WHEN reiterator encounters API errors THEN the system SHALL handle failures gracefully and respect rate limiting
5. WHEN reiterator is disabled dynamically THEN the system SHALL stop retry attempts for subsequent tasks while preserving ongoing iterations

### Requirement 11

**User Story:** As a developer, I want comprehensive documentation and examples for reiterator functionality, so that I can implement and troubleshoot the feature effectively.

#### Acceptance Criteria

1. WHEN developers access SDK documentation THEN the system SHALL provide clear examples of enabling reiterator during initialization
2. WHEN developers review reiterator examples THEN the system SHALL demonstrate dynamic enabling/disabling and status monitoring
3. WHEN developers read documentation THEN the system SHALL explain rate limiting behavior and recommended backoff strategies
4. WHEN developers implement reiterator THEN the system SHALL provide warnings about potential costs and delays in achieving consensus
5. WHEN developers troubleshoot reiterator THEN the system SHALL provide logging and debugging information for retry attempts