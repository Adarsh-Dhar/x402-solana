"""
Custom exception classes for the HumanRPC SDK.

These exceptions provide clear error messages and preserve original error context
for better debugging and error handling.
"""


class SDKError(Exception):
    """Base exception class for all SDK errors."""
    pass


class SDKConfigurationError(SDKError):
    """
    Raised when SDK configuration is invalid or missing.
    
    This includes missing environment variables, invalid private keys,
    or incorrect network configurations.
    """
    pass


class InvoiceValidationError(SDKError):
    """
    Raised when invoice parsing or validation fails.
    
    This includes malformed JSON, missing required fields,
    or invalid invoice data structures.
    """
    pass


class TransactionBuildError(SDKError):
    """
    Raised when Solana transaction construction fails.
    
    This includes failures in building SOL transfers, SPL token transfers,
    or transaction signing operations.
    """
    pass


class PaymentError(SDKError):
    """
    Raised when payment processing fails.
    
    This includes insufficient funds, network connectivity issues,
    or payment verification failures.
    """
    pass


class HumanVerificationError(SDKError):
    """
    Raised when Human RPC API operations fail.
    
    This includes API timeouts, task creation failures,
    or human verdict retrieval errors.
    """
    pass