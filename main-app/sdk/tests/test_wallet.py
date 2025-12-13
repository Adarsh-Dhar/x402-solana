"""
Property-based tests for wallet key validation.

**Feature: human-rpc-python-sdk, Property 8: Error handling consistency (key validation)**
Tests that wallet key validation provides consistent error handling with descriptive messages.
"""

import pytest
import os
import base58
from hypothesis import given, strategies as st
from solders.keypair import Keypair
from human_rpc_sdk.wallet import WalletManager
from human_rpc_sdk.exceptions import SDKConfigurationError


class TestWalletKeyValidation:
    """Test wallet key validation properties."""
    
    def test_valid_key_loads_successfully(self, test_keypair):
        """Test that valid keys load without errors."""
        full_keypair_bytes = bytes(test_keypair)
        valid_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        wallet = WalletManager(private_key=valid_private_key)
        
        assert wallet.get_public_key() == test_keypair.pubkey()
        assert wallet.get_signer() is not None
    
    def test_missing_key_raises_error(self):
        """Test that missing private key raises descriptive error."""
        # Clear environment variable
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        if "SOLANA_PRIVATE_KEY" in os.environ:
            del os.environ["SOLANA_PRIVATE_KEY"]
        
        try:
            with pytest.raises(SDKConfigurationError) as exc_info:
                WalletManager()
            
            error_msg = str(exc_info.value)
            assert "SOLANA_PRIVATE_KEY" in error_msg
            assert "required" in error_msg.lower()
            
        finally:
            # Restore environment
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
    
    @given(st.text(min_size=1, max_size=100))
    def test_invalid_key_format_raises_error(self, invalid_key):
        """
        **Feature: human-rpc-python-sdk, Property 8: Error handling consistency (key validation)**
        
        Property: For any invalid private key format, WalletManager should raise
        SDKConfigurationError with descriptive message.
        """
        # Skip potentially valid keys (64-byte base58 strings)
        try:
            decoded = base58.b58decode(invalid_key)
            if len(decoded) == 64:
                return  # Skip potentially valid keys
        except:
            pass  # Invalid base58, which is what we want to test
        
        with pytest.raises(SDKConfigurationError) as exc_info:
            WalletManager(private_key=invalid_key)
        
        error_msg = str(exc_info.value)
        assert "Failed to load private key" in error_msg
        assert "valid base58-encoded Solana private key" in error_msg
    
    @given(st.binary(min_size=1, max_size=128))
    def test_invalid_key_length_raises_error(self, invalid_bytes):
        """
        **Feature: human-rpc-python-sdk, Property 8: Error handling consistency (key validation)**
        
        Property: For any byte sequence that is not 64 bytes, WalletManager should
        raise SDKConfigurationError when encoded as base58.
        """
        # Skip 64-byte sequences (potentially valid)
        if len(invalid_bytes) == 64:
            return
        
        invalid_key = base58.b58encode(invalid_bytes).decode()
        
        with pytest.raises(SDKConfigurationError) as exc_info:
            WalletManager(private_key=invalid_key)
        
        error_msg = str(exc_info.value)
        assert "Failed to load private key" in error_msg
    
    def test_environment_variable_fallback(self, test_keypair):
        """Test that WalletManager falls back to environment variable."""
        full_keypair_bytes = bytes(test_keypair)
        env_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        os.environ["SOLANA_PRIVATE_KEY"] = env_private_key
        
        try:
            # Should use environment variable when no parameter provided
            wallet = WalletManager()
            assert wallet.get_public_key() == test_keypair.pubkey()
            
        finally:
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
            else:
                os.environ.pop("SOLANA_PRIVATE_KEY", None)
    
    def test_parameter_overrides_environment(self, test_keypair):
        """Test that constructor parameter overrides environment variable."""
        # Set up different keys
        env_keypair = Keypair()
        env_full_bytes = bytes(env_keypair)
        env_private_key = base58.b58encode(env_full_bytes).decode()
        
        param_full_bytes = bytes(test_keypair)
        param_private_key = base58.b58encode(param_full_bytes).decode()
        
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        os.environ["SOLANA_PRIVATE_KEY"] = env_private_key
        
        try:
            # Constructor parameter should override environment variable
            wallet = WalletManager(private_key=param_private_key)
            
            # Should use the parameter key, not the environment key
            assert wallet.get_public_key() == test_keypair.pubkey()
            assert wallet.get_public_key() != env_keypair.pubkey()
            
        finally:
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
            else:
                os.environ.pop("SOLANA_PRIVATE_KEY", None)
    
    def test_error_message_security(self):
        """
        **Feature: human-rpc-python-sdk, Property 8: Error handling consistency (key validation)**
        
        Property: Error messages should never expose the actual private key content.
        """
        # Use a fake but properly formatted key
        fake_key = "invalid_but_looks_like_base58_key_12345678901234567890"
        
        with pytest.raises(SDKConfigurationError) as exc_info:
            WalletManager(private_key=fake_key)
        
        error_msg = str(exc_info.value)
        # Error message should not contain the actual key
        assert fake_key not in error_msg
        # But should contain helpful information
        assert "Failed to load private key" in error_msg
    
    @given(st.text(alphabet="123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz", min_size=80, max_size=120))
    def test_valid_base58_invalid_keypair_format(self, valid_base58):
        """
        **Feature: human-rpc-python-sdk, Property 8: Error handling consistency (key validation)**
        
        Property: For any valid base58 string that doesn't represent a valid Solana keypair,
        WalletManager should raise SDKConfigurationError.
        """
        try:
            decoded = base58.b58decode(valid_base58)
            if len(decoded) == 64:
                # This might be a valid keypair, skip it
                return
        except:
            # Invalid base58, skip
            return
        
        # Valid base58 but wrong length for keypair
        with pytest.raises(SDKConfigurationError) as exc_info:
            WalletManager(private_key=valid_base58)
        
        error_msg = str(exc_info.value)
        assert "Failed to load private key" in error_msg