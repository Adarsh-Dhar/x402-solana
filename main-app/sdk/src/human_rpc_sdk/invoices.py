"""
Invoice parsing and validation for 402 Payment Required responses.

Handles parsing of invoice data from HTTP responses and validates
required fields for both SOL and SPL token payments.
"""

import json
from typing import Dict, Any, Optional
from .exceptions import InvoiceValidationError


class Invoice:
    """
    Represents a payment invoice from a 402 Payment Required response.
    
    Supports both SOL and SPL token payment formats with validation
    of required fields and currency conversion.
    """
    
    def __init__(self, data: Dict[str, Any]):
        """
        Initialize invoice from response data.
        
        Args:
            data: Dictionary containing invoice data from 402 response
            
        Raises:
            InvoiceValidationError: If invoice data is invalid or malformed
        """
        self.raw_data = data
        self._parse_invoice_data()
        self.validate()
    
    def _parse_invoice_data(self):
        """Parse invoice data from various supported formats."""
        # Support multiple invoice formats
        if "invoice" in self.raw_data:
            # Standard format: {"status": "payment_required", "invoice": {...}}
            self.invoice_data = self.raw_data["invoice"]
        elif "payment" in self.raw_data:
            # Human RPC format: {"payment": {...}}
            self.invoice_data = self.raw_data["payment"]
        elif "accepts" in self.raw_data and self.raw_data["accepts"]:
            # Alternative format: {"accepts": [{...}]}
            self.invoice_data = self.raw_data["accepts"][0]
        else:
            # Direct format: assume the data itself is the invoice
            self.invoice_data = self.raw_data
    
    def validate(self) -> None:
        """
        Validate invoice data for required fields.
        
        Raises:
            InvoiceValidationError: If required fields are missing or invalid
        """
        if not isinstance(self.invoice_data, dict):
            raise InvoiceValidationError("Invoice data must be a dictionary")
        
        # Check for amount
        if "amount" not in self.invoice_data and "amountSOL" not in self.invoice_data:
            raise InvoiceValidationError("Invoice must contain 'amount' or 'amountSOL' field")
        
        # Determine currency and validate accordingly
        currency = self.get_currency()
        
        if currency == "SOL":
            self._validate_sol_invoice()
        elif currency in ["USDC", "SPL"]:
            self._validate_spl_invoice()
        else:
            raise InvoiceValidationError(f"Unsupported currency: {currency}")
    
    def _validate_sol_invoice(self):
        """Validate SOL-specific invoice fields."""
        if not self.get_recipient():
            raise InvoiceValidationError(
                "SOL invoice must contain 'recipient' or 'recipientWallet' field"
            )
    
    def _validate_spl_invoice(self):
        """Validate SPL token-specific invoice fields."""
        if not self.get_recipient():
            raise InvoiceValidationError(
                "SPL token invoice must contain 'recipient' or 'tokenAccount' field"
            )
        
        if not self.get_mint():
            raise InvoiceValidationError(
                "SPL token invoice must contain 'mint' field"
            )
    
    def get_amount_lamports(self) -> int:
        """
        Get payment amount in lamports (for SOL) or base units (for SPL tokens).
        
        Returns:
            Amount in smallest unit (lamports for SOL, base units for tokens)
        """
        # Check for direct lamports amount
        if "amount" in self.invoice_data:
            amount = self.invoice_data["amount"]
            if isinstance(amount, (int, float)):
                return int(amount)
        
        # Check for SOL amount (convert to lamports)
        if "amountSOL" in self.invoice_data:
            amount_sol = self.invoice_data["amountSOL"]
            if isinstance(amount_sol, (int, float)):
                return int(amount_sol * 1_000_000_000)  # Convert SOL to lamports
        
        raise InvoiceValidationError("Could not determine payment amount")
    
    def get_recipient(self) -> str:
        """
        Get recipient address for the payment.
        
        Returns:
            Recipient wallet address or token account address
        """
        # Try various field names for recipient
        for field in ["recipient", "recipientWallet", "tokenAccount"]:
            if field in self.invoice_data:
                recipient = self.invoice_data[field]
                if isinstance(recipient, str) and recipient.strip():
                    return recipient.strip()
        
        raise InvoiceValidationError("Could not find valid recipient address")
    
    def get_currency(self) -> str:
        """
        Determine the currency type for this invoice.
        
        Returns:
            Currency string ("SOL", "USDC", etc.)
        """
        # Explicit currency field
        if "currency" in self.invoice_data:
            return self.invoice_data["currency"].upper()
        
        # Infer from fields present
        if "tokenAccount" in self.invoice_data or "mint" in self.invoice_data:
            return "USDC"  # Default SPL token
        elif "recipientWallet" in self.invoice_data or "amountSOL" in self.invoice_data:
            return "SOL"
        
        # Default to SOL if unclear
        return "SOL"
    
    def get_mint(self) -> Optional[str]:
        """
        Get mint address for SPL token payments.
        
        Returns:
            Mint address string or None for SOL payments
        """
        return self.invoice_data.get("mint")
    
    def get_reference(self) -> Optional[str]:
        """
        Get payment reference for transaction lookup.
        
        Returns:
            Reference string or None if not provided
        """
        return self.invoice_data.get("reference")
    
    def get_network(self) -> str:
        """
        Get network for the payment.
        
        Returns:
            Network string (defaults to "devnet")
        """
        network = self.invoice_data.get("network", "devnet")
        cluster = self.invoice_data.get("cluster", "devnet")
        
        # Normalize network names
        if "mainnet" in network.lower() or "mainnet" in cluster.lower():
            return "mainnet-beta"
        else:
            return "devnet"


def parse_invoice_from_response(response_data: str) -> Invoice:
    """
    Parse invoice from HTTP response body.
    
    Args:
        response_data: JSON string from 402 response body
        
    Returns:
        Parsed and validated Invoice object
        
    Raises:
        InvoiceValidationError: If response cannot be parsed or is invalid
    """
    try:
        data = json.loads(response_data)
    except json.JSONDecodeError as e:
        raise InvoiceValidationError(f"Invalid JSON in response: {e}")
    
    return Invoice(data)