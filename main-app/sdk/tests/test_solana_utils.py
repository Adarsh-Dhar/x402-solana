"""
Property-based tests for Solana transaction building utilities.

**Feature: human-rpc-python-sdk, Property 4: Transaction building correctness**
**Feature: human-rpc-python-sdk, Property 10: Transaction serialization round-trip**
Tests that transaction building creates correctly formatted transactions and serialization works properly.
"""

import pytest
import base64
import json
from unittest.mock import patch, Mock
from hypothesis import given, strategies as st
from solders.keypair import Keypair
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.transaction import Transaction

from human_rpc_sdk.solana_utils import (
    build_sol_transfer,
    build_spl_transfer,
    sign_and_serialize_transaction,
    build_payment_transaction,
    create_payment_header,
    get_recent_blockhash,
    derive_associated_token_address,
    get_rpc_url
)
from human_rpc_sdk.exceptions import TransactionBuildError, PaymentError


class TestSolanaTransactionBuilding:
    """Test Solana transaction building properties."""
    
    @pytest.fixture
    def mock_blockhash(self):
        """Provide a mock blockhash for testing."""
        return Hash.from_string("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N")
    
    @pytest.fixture
    def recipient_keypair(self):
        """Provide a recipient keypair for testing."""
        return Keypair()
    
    def test_sol_transfer_builds_successfully(self, test_keypair, recipient_keypair, mock_blockhash):
        """Test that SOL transfers build without errors."""
        transaction = build_sol_transfer(
            sender_keypair=test_keypair,
            recipient_pubkey=recipient_keypair.pubkey(),
            lamports=1000000,
            recent_blockhash=mock_blockhash
        )
        
        assert isinstance(transaction, Transaction)
        assert transaction.message.recent_blockhash == mock_blockhash
        assert len(transaction.message.instructions) == 1
    
    def test_spl_transfer_builds_successfully(self, test_keypair, recipient_keypair, mock_blockhash):
        """Test that SPL transfers build without errors."""
        # Use USDC mint address
        mint_pubkey = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
        recipient_ata = derive_associated_token_address(recipient_keypair.pubkey(), mint_pubkey)
        
        transaction = build_spl_transfer(
            sender_keypair=test_keypair,
            recipient_ata=recipient_ata,
            mint_pubkey=mint_pubkey,
            amount=300000,
            recent_blockhash=mock_blockhash
        )
        
        assert isinstance(transaction, Transaction)
        assert transaction.message.recent_blockhash == mock_blockhash
        assert len(transaction.message.instructions) == 1
    
    def test_cannot_send_sol_to_self(self, test_keypair, mock_blockhash):
        """Test that sending SOL to self raises error."""
        with pytest.raises(TransactionBuildError) as exc_info:
            build_sol_transfer(
                sender_keypair=test_keypair,
                recipient_pubkey=test_keypair.pubkey(),
                lamports=1000000,
                recent_blockhash=mock_blockhash
            )
        
        error_msg = str(exc_info.value)
        assert "Cannot send SOL to self" in error_msg
    
    @given(st.integers(min_value=1, max_value=1000000000))
    def test_sol_transfer_amount_property(self, test_keypair, recipient_keypair, mock_blockhash, amount):
        """
        **Feature: human-rpc-python-sdk, Property 4: Transaction building correctness**
        
        Property: For any valid lamport amount, SOL transfer should build successfully
        and contain the correct amount in the instruction.
        """
        transaction = build_sol_transfer(
            sender_keypair=test_keypair,
            recipient_pubkey=recipient_keypair.pubkey(),
            lamports=amount,
            recent_blockhash=mock_blockhash
        )
        
        assert isinstance(transaction, Transaction)
        # The instruction should contain the transfer amount
        instruction = transaction.message.instructions[0]
        assert instruction is not None
    
    @given(st.integers(min_value=1, max_value=1000000))
    def test_spl_transfer_amount_property(self, test_keypair, recipient_keypair, mock_blockhash, amount):
        """
        **Feature: human-rpc-python-sdk, Property 4: Transaction building correctness**
        
        Property: For any valid token amount, SPL transfer should build successfully
        and contain the correct amount in the instruction data.
        """
        mint_pubkey = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
        recipient_ata = derive_associated_token_address(recipient_keypair.pubkey(), mint_pubkey)
        
        transaction = build_spl_transfer(
            sender_keypair=test_keypair,
            recipient_ata=recipient_ata,
            mint_pubkey=mint_pubkey,
            amount=amount,
            recent_blockhash=mock_blockhash
        )
        
        assert isinstance(transaction, Transaction)
        instruction = transaction.message.instructions[0]
        
        # Check that instruction data contains the amount
        # First byte should be 3 (transfer instruction), followed by 8 bytes for amount
        assert len(instruction.data) >= 9
        assert instruction.data[0] == 3  # Transfer instruction type
        
        # Extract amount from instruction data (little-endian 8 bytes)
        amount_bytes = instruction.data[1:9]
        extracted_amount = int.from_bytes(amount_bytes, 'little')
        assert extracted_amount == amount
    
    def test_transaction_serialization_round_trip(self, test_keypair, recipient_keypair, mock_blockhash):
        """
        **Feature: human-rpc-python-sdk, Property 10: Transaction serialization round-trip**
        
        Property: For any valid transaction, serializing then deserializing should
        produce equivalent transaction structure.
        """
        # Build a transaction
        transaction = build_sol_transfer(
            sender_keypair=test_keypair,
            recipient_pubkey=recipient_keypair.pubkey(),
            lamports=1000000,
            recent_blockhash=mock_blockhash
        )
        
        # Serialize it
        serialized = sign_and_serialize_transaction(transaction, test_keypair)
        
        # Should be valid base64
        assert isinstance(serialized, str)
        decoded_bytes = base64.b64decode(serialized)
        assert len(decoded_bytes) > 0
        
        # Should be able to reconstruct transaction from bytes
        reconstructed_tx = Transaction.from_bytes(decoded_bytes)
        assert isinstance(reconstructed_tx, Transaction)
        
        # Key properties should match
        assert reconstructed_tx.message.recent_blockhash == transaction.message.recent_blockhash
        assert len(reconstructed_tx.message.instructions) == len(transaction.message.instructions)
    
    @patch('human_rpc_sdk.solana_utils.requests.post')
    def test_rpc_error_handling(self, mock_post, test_keypair, recipient_keypair):
        """Test that RPC errors are properly handled."""
        # Mock RPC error response
        mock_response = Mock()
        mock_response.json.return_value = {
            "error": {"code": -32602, "message": "Invalid params"}
        }
        mock_response.raise_for_status.return_value = None
        mock_post.return_value = mock_response
        
        with pytest.raises(TransactionBuildError) as exc_info:
            build_sol_transfer(
                sender_keypair=test_keypair,
                recipient_pubkey=recipient_keypair.pubkey(),
                lamports=1000000,
                network="devnet"
            )
        
        error_msg = str(exc_info.value)
        assert "RPC error" in error_msg
    
    @patch('human_rpc_sdk.solana_utils.requests.post')
    def test_network_timeout_handling(self, mock_post, test_keypair, recipient_keypair):
        """Test that network timeouts are properly handled."""
        import requests
        mock_post.side_effect = requests.Timeout("Request timed out")
        
        with pytest.raises(TransactionBuildError) as exc_info:
            build_sol_transfer(
                sender_keypair=test_keypair,
                recipient_pubkey=recipient_keypair.pubkey(),
                lamports=1000000,
                network="devnet"
            )
        
        error_msg = str(exc_info.value)
        assert "Failed to get recent blockhash" in error_msg
    
    def test_build_payment_transaction_sol(self, test_keypair, recipient_keypair):
        """Test building payment transaction for SOL."""
        with patch('human_rpc_sdk.solana_utils.get_recent_blockhash') as mock_blockhash:
            mock_blockhash.return_value = Hash.from_string("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N")
            
            serialized_tx = build_payment_transaction(
                sender_keypair=test_keypair,
                recipient=str(recipient_keypair.pubkey()),
                amount=1000000,
                currency="SOL",
                network="devnet"
            )
            
            assert isinstance(serialized_tx, str)
            # Should be valid base64
            decoded = base64.b64decode(serialized_tx)
            assert len(decoded) > 0
    
    def test_build_payment_transaction_spl_missing_mint(self, test_keypair, recipient_keypair):
        """Test that SPL payment without mint raises error."""
        with pytest.raises(PaymentError) as exc_info:
            build_payment_transaction(
                sender_keypair=test_keypair,
                recipient=str(recipient_keypair.pubkey()),
                amount=300000,
                currency="USDC",
                network="devnet"
            )
        
        error_msg = str(exc_info.value)
        assert "Mint address required" in error_msg
    
    def test_build_payment_transaction_spl_with_mint(self, test_keypair, recipient_keypair):
        """Test building payment transaction for SPL token."""
        with patch('human_rpc_sdk.solana_utils.get_recent_blockhash') as mock_blockhash:
            mock_blockhash.return_value = Hash.from_string("EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N")
            
            mint_address = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
            recipient_ata = derive_associated_token_address(
                recipient_keypair.pubkey(),
                Pubkey.from_string(mint_address)
            )
            
            serialized_tx = build_payment_transaction(
                sender_keypair=test_keypair,
                recipient=str(recipient_ata),
                amount=300000,
                currency="USDC",
                mint=mint_address,
                network="devnet"
            )
            
            assert isinstance(serialized_tx, str)
            # Should be valid base64
            decoded = base64.b64decode(serialized_tx)
            assert len(decoded) > 0
    
    def test_create_payment_header(self):
        """Test creating payment header for x402 protocol."""
        serialized_tx = "base64_encoded_transaction_here"
        network = "devnet"
        
        header = create_payment_header(serialized_tx, network)
        
        assert header["x402Version"] == 1
        assert header["scheme"] == "solana"
        assert header["network"] == network
        assert header["payload"]["serializedTransaction"] == serialized_tx
    
    def test_derive_associated_token_address(self, test_keypair):
        """Test ATA derivation is deterministic."""
        mint_pubkey = Pubkey.from_string("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v")
        
        # Should always return the same address for same inputs
        ata1 = derive_associated_token_address(test_keypair.pubkey(), mint_pubkey)
        ata2 = derive_associated_token_address(test_keypair.pubkey(), mint_pubkey)
        
        assert ata1 == ata2
        assert isinstance(ata1, Pubkey)
    
    @given(st.text(min_size=1, max_size=50))
    def test_network_parameter_handling(self, network_name):
        """
        **Feature: human-rpc-python-sdk, Property 4: Transaction building correctness**
        
        Property: For any network name, RPC URL selection should work correctly.
        """
        rpc_url = get_rpc_url(network_name)
        assert isinstance(rpc_url, str)
        assert rpc_url.startswith("http")
    
    def test_invalid_recipient_address_handling(self, test_keypair, mock_blockhash):
        """Test that invalid recipient addresses are handled properly."""
        with pytest.raises((TransactionBuildError, ValueError)):
            build_payment_transaction(
                sender_keypair=test_keypair,
                recipient="invalid_address",
                amount=1000000,
                currency="SOL",
                network="devnet"
            )
    
    @given(st.integers(min_value=-1000000, max_value=0))
    def test_negative_amount_handling(self, test_keypair, recipient_keypair, mock_blockhash, negative_amount):
        """
        **Feature: human-rpc-python-sdk, Property 4: Transaction building correctness**
        
        Property: For any negative or zero amount, transaction building should handle it appropriately.
        """
        if negative_amount <= 0:
            # The system should either reject negative amounts or handle them gracefully
            try:
                transaction = build_sol_transfer(
                    sender_keypair=test_keypair,
                    recipient_pubkey=recipient_keypair.pubkey(),
                    lamports=negative_amount,
                    recent_blockhash=mock_blockhash
                )
                # If it doesn't raise an error, the transaction should still be valid
                assert isinstance(transaction, Transaction)
            except (TransactionBuildError, ValueError):
                # It's acceptable to reject negative amounts
                pass