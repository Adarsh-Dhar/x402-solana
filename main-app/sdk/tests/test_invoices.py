"""
Property-based tests for invoice parsing and validation.

**Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
Tests that invoice parsing successfully handles valid invoices and rejects invalid ones with descriptive errors.
"""

import pytest
import json
from hypothesis import given, strategies as st
from human_rpc_sdk.invoices import Invoice, parse_invoice_from_response
from human_rpc_sdk.exceptions import InvoiceValidationError


class TestInvoiceParsingValidation:
    """Test invoice parsing and validation properties."""
    
    def test_valid_sol_invoice_parses_successfully(self, sample_invoice_sol):
        """Test that valid SOL invoices parse without errors."""
        invoice = Invoice(sample_invoice_sol)
        
        assert invoice.get_currency() == "SOL"
        assert invoice.get_amount_lamports() == 1000000  # 0.001 SOL
        assert invoice.get_recipient() == "11111111111111111111111111111112"
        assert invoice.get_network() == "devnet"
    
    def test_valid_usdc_invoice_parses_successfully(self, sample_invoice_usdc):
        """Test that valid USDC invoices parse without errors."""
        invoice = Invoice(sample_invoice_usdc)
        
        assert invoice.get_currency() == "USDC"
        assert invoice.get_amount_lamports() == 300000  # 0.3 USDC
        assert invoice.get_recipient() == "11111111111111111111111111111112"
        assert invoice.get_mint() == "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        assert invoice.get_network() == "devnet"
    
    def test_parse_from_json_string(self, sample_invoice_sol):
        """Test parsing invoice from JSON string."""
        json_string = json.dumps(sample_invoice_sol)
        invoice = parse_invoice_from_response(json_string)
        
        assert invoice.get_currency() == "SOL"
        assert invoice.get_amount_lamports() == 1000000
    
    def test_invalid_json_raises_error(self):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any invalid JSON string, parsing should raise InvoiceValidationError.
        """
        invalid_json = '{"invalid": json, "missing": quote}'
        
        with pytest.raises(InvoiceValidationError) as exc_info:
            parse_invoice_from_response(invalid_json)
        
        error_msg = str(exc_info.value)
        assert "Invalid JSON" in error_msg
    
    @given(st.dictionaries(
        keys=st.text(min_size=1, max_size=20),
        values=st.one_of(st.text(), st.integers(), st.floats()),
        min_size=0,
        max_size=10
    ))
    def test_missing_amount_field_raises_error(self, invoice_data):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any invoice data without amount or amountSOL fields,
        validation should raise InvoiceValidationError.
        """
        # Ensure no amount fields are present
        invoice_data.pop("amount", None)
        invoice_data.pop("amountSOL", None)
        
        with pytest.raises(InvoiceValidationError) as exc_info:
            Invoice(invoice_data)
        
        error_msg = str(exc_info.value)
        assert "amount" in error_msg.lower()
    
    @given(st.dictionaries(
        keys=st.text(min_size=1, max_size=20),
        values=st.one_of(st.text(), st.integers(), st.floats()),
        min_size=1,
        max_size=10
    ))
    def test_sol_invoice_missing_recipient_raises_error(self, invoice_data):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any SOL invoice without recipient fields, validation should raise error.
        """
        # Make it a SOL invoice with amount but no recipient
        invoice_data["amount"] = 1000000
        invoice_data["currency"] = "SOL"
        
        # Remove all recipient fields
        invoice_data.pop("recipient", None)
        invoice_data.pop("recipientWallet", None)
        invoice_data.pop("tokenAccount", None)
        
        with pytest.raises(InvoiceValidationError) as exc_info:
            Invoice(invoice_data)
        
        error_msg = str(exc_info.value)
        assert "recipient" in error_msg.lower()
    
    @given(st.dictionaries(
        keys=st.text(min_size=1, max_size=20),
        values=st.one_of(st.text(), st.integers(), st.floats()),
        min_size=1,
        max_size=10
    ))
    def test_spl_invoice_missing_mint_raises_error(self, invoice_data):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any SPL token invoice without mint field, validation should raise error.
        """
        # Make it an SPL token invoice
        invoice_data["amount"] = 300000
        invoice_data["currency"] = "USDC"
        invoice_data["tokenAccount"] = "11111111111111111111111111111112"
        
        # Remove mint field
        invoice_data.pop("mint", None)
        
        with pytest.raises(InvoiceValidationError) as exc_info:
            Invoice(invoice_data)
        
        error_msg = str(exc_info.value)
        assert "mint" in error_msg.lower()
    
    def test_multiple_invoice_formats_supported(self):
        """Test that multiple invoice formats are supported."""
        base_invoice = {
            "amount": 1000000,
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112",
            "network": "devnet"
        }
        
        # Standard format
        standard_format = {
            "status": "payment_required",
            "invoice": base_invoice,
            "message": "Payment required"
        }
        invoice1 = Invoice(standard_format)
        assert invoice1.get_currency() == "SOL"
        
        # Human RPC format
        human_rpc_format = {
            "payment": base_invoice
        }
        invoice2 = Invoice(human_rpc_format)
        assert invoice2.get_currency() == "SOL"
        
        # Alternative format
        alternative_format = {
            "accepts": [base_invoice]
        }
        invoice3 = Invoice(alternative_format)
        assert invoice3.get_currency() == "SOL"
        
        # Direct format
        invoice4 = Invoice(base_invoice)
        assert invoice4.get_currency() == "SOL"
    
    @given(st.integers(min_value=1, max_value=1000000000))
    def test_amount_conversion_property(self, amount_lamports):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any valid amount in lamports, the invoice should correctly
        store and retrieve the amount.
        """
        invoice_data = {
            "amount": amount_lamports,
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112"
        }
        
        invoice = Invoice(invoice_data)
        assert invoice.get_amount_lamports() == amount_lamports
    
    @given(st.floats(min_value=0.000000001, max_value=1000.0))
    def test_sol_amount_conversion_property(self, amount_sol):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any valid SOL amount, conversion to lamports should be correct.
        """
        invoice_data = {
            "amountSOL": amount_sol,
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112"
        }
        
        invoice = Invoice(invoice_data)
        expected_lamports = int(amount_sol * 1_000_000_000)
        assert invoice.get_amount_lamports() == expected_lamports
    
    def test_network_normalization(self):
        """Test that network names are normalized correctly."""
        # Test mainnet variations
        mainnet_variations = ["mainnet", "mainnet-beta", "MAINNET", "Mainnet-Beta"]
        for network in mainnet_variations:
            invoice_data = {
                "amount": 1000000,
                "currency": "SOL",
                "recipient": "11111111111111111111111111111112",
                "network": network
            }
            invoice = Invoice(invoice_data)
            assert invoice.get_network() == "mainnet-beta"
        
        # Test devnet variations
        devnet_variations = ["devnet", "DEVNET", "Devnet", "testnet"]
        for network in devnet_variations:
            invoice_data = {
                "amount": 1000000,
                "currency": "SOL",
                "recipient": "11111111111111111111111111111112",
                "network": network
            }
            invoice = Invoice(invoice_data)
            assert invoice.get_network() == "devnet"
    
    def test_currency_inference(self):
        """Test that currency is correctly inferred from fields."""
        # Should infer SOL from recipientWallet
        sol_invoice = {
            "amount": 1000000,
            "recipientWallet": "11111111111111111111111111111112"
        }
        invoice = Invoice(sol_invoice)
        assert invoice.get_currency() == "SOL"
        
        # Should infer USDC from tokenAccount
        usdc_invoice = {
            "amount": 300000,
            "tokenAccount": "11111111111111111111111111111112",
            "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        }
        invoice = Invoice(usdc_invoice)
        assert invoice.get_currency() == "USDC"
    
    @given(st.text(min_size=1, max_size=100))
    def test_reference_field_handling(self, reference):
        """
        **Feature: human-rpc-python-sdk, Property 3: Invoice parsing and validation**
        
        Property: For any reference string, the invoice should correctly store and retrieve it.
        """
        invoice_data = {
            "amount": 1000000,
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112",
            "reference": reference
        }
        
        invoice = Invoice(invoice_data)
        assert invoice.get_reference() == reference
    
    def test_optional_fields_handling(self):
        """Test that optional fields are handled correctly."""
        minimal_invoice = {
            "amount": 1000000,
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112"
        }
        
        invoice = Invoice(minimal_invoice)
        
        # Optional fields should return None or defaults
        assert invoice.get_reference() is None
        assert invoice.get_network() == "devnet"  # Default
        assert invoice.get_mint() is None  # Not applicable for SOL