# Implementation Plan

- [x] 1. Set up project structure and core interfaces
  - Create directory structure for SDK modules (agent.py, decorator.py, solana_utils.py, invoices.py, exceptions.py, wallet.py)
  - Define custom exception classes in exceptions.py
  - Set up testing framework with pytest and hypothesis for property-based testing
  - Create pyproject.toml with package metadata and dependencies
  - _Requirements: 1.1, 1.2_

- [x] 1.1 Write property test for configuration validation
  - **Property 1: Configuration validation**
  - **Validates: Requirements 1.3, 1.4, 1.5**

- [x] 2. Implement wallet management and key handling
  - Create WalletManager class in wallet.py for loading and managing Solana private keys
  - Implement environment variable loading with validation and error handling
  - Add support for base58 key format validation and conversion
  - _Requirements: 1.3, 1.5, 5.1_

- [x] 2.1 Write property test for wallet key validation
  - **Property 8: Error handling consistency (key validation)**
  - **Validates: Requirements 5.1**

- [x] 3. Implement invoice parsing and validation
  - Create Invoice class in invoices.py for parsing 402 response bodies
  - Implement validation for required fields (amount, currency, recipient)
  - Add support for both SOL and SPL token invoice formats
  - Handle currency conversion (lamports, token decimals)
  - _Requirements: 2.2, 2.3, 5.2_

- [x] 3.1 Write property test for invoice parsing
  - **Property 3: Invoice parsing and validation**
  - **Validates: Requirements 2.2, 2.3**

- [x] 4. Implement Solana transaction building utilities
  - Create transaction building functions in solana_utils.py
  - Implement build_sol_transfer for native SOL payments
  - Implement build_spl_transfer for SPL token payments with ATA handling
  - Add transaction signing and base64 serialization functions
  - _Requirements: 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4.1 Write property test for transaction building
  - **Property 4: Transaction building correctness**
  - **Validates: Requirements 2.4, 3.1, 3.2, 3.3, 3.4**

- [x] 4.2 Write property test for transaction serialization
  - **Property 10: Transaction serialization round-trip**
  - **Validates: Requirements 2.4, 2.5**

- [ ] 5. Implement AutoAgent HTTP client
  - Create AutoAgent class in agent.py with HTTP methods (get, post, request)
  - Implement 402 response detection and invoice parsing integration
  - Add automatic payment processing using solana_utils and wallet components
  - Implement X-PAYMENT header creation and request retry logic
  - _Requirements: 2.1, 2.5_

- [ ] 5.1 Write property test for HTTP pass-through
  - **Property 2: HTTP request pass-through**
  - **Validates: Requirements 2.1**

- [ ] 5.2 Write property test for payment retry mechanism
  - **Property 5: Payment retry mechanism**
  - **Validates: Requirements 2.5**

- [ ] 6. Implement HumanRPC API integration
  - Add ask_human_rpc method to AutoAgent class
  - Implement task creation and polling functionality
  - Add timeout handling and error recovery for human verification
  - _Requirements: 4.3, 4.4, 4.5_

- [ ] 7. Implement @guard decorator
  - Create guard decorator function in decorator.py
  - Implement confidence threshold checking logic
  - Add integration with AutoAgent for human verification requests
  - Implement result combination logic for AI + human responses
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 7.1 Write property test for guard threshold behavior
  - **Property 6: Guard decorator threshold behavior**
  - **Validates: Requirements 4.1, 4.2**

- [ ] 7.2 Write property test for human verification integration
  - **Property 7: Human verification integration**
  - **Validates: Requirements 4.3, 4.4**

- [ ] 8. Implement comprehensive error handling
  - Add error wrapping for Solana RPC failures
  - Implement descriptive error messages for payment failures
  - Add debug logging with security considerations (no private key exposure)
  - _Requirements: 5.3, 5.4, 5.5_

- [ ] 8.1 Write property test for error handling consistency
  - **Property 8: Error handling consistency**
  - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

- [ ] 8.2 Write property test for security and logging
  - **Property 9: Security and logging**
  - **Validates: Requirements 5.5**

- [ ] 9. Create local gateway stub for testing
  - Implement Flask/FastAPI gateway stub in tests/integration/gateway_stub.py
  - Add endpoints that return 402 responses with valid invoices
  - Implement X-PAYMENT header validation and transaction verification
  - Add unlocked content responses after successful payment validation
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 10. Write integration tests
  - Create end-to-end test using gateway stub
  - Test complete payment flow from 402 response to unlocked content
  - Verify transaction validation in stub matches SDK transaction building
  - Test both SOL and USDC payment scenarios
  - _Requirements: 6.5_

- [ ] 11. Create example implementations
  - Create sync_bot.py demonstrating @guard decorator usage
  - Create http_example.py demonstrating AutoAgent usage with gateway stub
  - Add example showing different confidence thresholds and agent configurations
  - _Requirements: 7.4_

- [ ] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Set up packaging and build configuration
  - Configure pyproject.toml for pip installation
  - Add package metadata, dependencies, and entry points
  - Test package building with python -m build
  - _Requirements: 7.5_

- [ ] 14. Create GitHub Actions CI workflow
  - Create .github/workflows/ci.yml for automated testing
  - Configure workflow to run unit tests, property tests, and integration tests
  - Add linting and code quality checks
  - _Requirements: 8.1_

- [x] 15. Implement reiterator core functionality
  - Create ReiteratorManager class in reiterator.py with retry logic and backoff strategies
  - Implement should_retry method to detect negative consensus outcomes
  - Add calculate_delay method with support for exponential, linear, and fixed backoff strategies
  - Implement execute_with_retry method for automatic task resubmission
  - _Requirements: 9.2, 9.3, 9.4, 9.5_

- [x] 15.1 Write property test for reiterator configuration validation
  - **Property 11: Reiterator configuration validation**
  - **Validates: Requirements 9.1, 10.1**

- [x] 15.2 Write property test for negative consensus retry trigger
  - **Property 12: Negative consensus retry trigger**
  - **Validates: Requirements 9.2**

- [x] 15.3 Write property test for rate limiting and backoff behavior
  - **Property 13: Rate limiting and backoff behavior**
  - **Validates: Requirements 9.3**

- [x] 15.4 Write property test for parameter preservation during retries
  - **Property 14: Parameter preservation during retries**
  - **Validates: Requirements 9.4**

- [x] 15.5 Write property test for positive consensus termination
  - **Property 15: Positive consensus termination**
  - **Validates: Requirements 9.5**

- [x] 16. Integrate reiterator with AutoAgent
  - Add reiterator configuration parameters to AutoAgent __init__ method
  - Implement enable_reiterator and disable_reiterator methods
  - Add get_reiterator_status method for monitoring iteration progress
  - Integrate reiterator with ask_human_rpc method for automatic retry logic
  - _Requirements: 9.1, 10.2, 10.5_

- [x] 16.1 Write property test for status monitoring accuracy
  - **Property 16: Status monitoring accuracy**
  - **Validates: Requirements 10.2**

- [x] 16.2 Write property test for dynamic configuration changes
  - **Property 19: Dynamic configuration changes**
  - **Validates: Requirements 10.5**

- [x] 17. Implement reiterator termination and error handling
  - Add maximum attempts checking and termination logic
  - Implement graceful error handling for API failures during retries
  - Add reiterator-specific exception classes (ReiteratorConfigurationError, ReiteratorMaxAttemptsError, ReiteratorRateLimitError)
  - Implement debug logging for retry attempts with security considerations
  - _Requirements: 10.3, 10.4, 11.5_

- [x] 17.1 Write property test for maximum attempts termination
  - **Property 17: Maximum attempts termination**
  - **Validates: Requirements 10.3**

- [x] 17.2 Write property test for error handling during retries
  - **Property 18: Error handling during retries**
  - **Validates: Requirements 10.4**

- [x] 17.3 Write property test for debug logging for retries
  - **Property 20: Debug logging for retries**
  - **Validates: Requirements 11.5**

- [ ] 18. Create reiterator integration tests
  - Add integration tests for complete reiterator workflow using gateway stub
  - Test negative consensus detection and automatic retry triggering
  - Verify rate limiting and backoff behavior in realistic scenarios
  - Test maximum attempts termination and error handling
  - _Requirements: 9.2, 9.3, 10.3, 10.4_

- [x] 19. Create reiterator examples and documentation
  - Add reiterator_example.py demonstrating initialization with reiterator enabled
  - Create dynamic_reiterator.py showing enable/disable and status monitoring
  - Update README.md with reiterator configuration options and usage examples
  - Add warnings about potential costs and delays in achieving consensus
  - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [ ] 20. Checkpoint - Ensure all reiterator tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 21. Final checkpoint - Complete testing and validation
  - Ensure all tests pass, ask the user if questions arise.