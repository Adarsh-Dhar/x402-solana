"""
Property-based tests for SDK configuration validation.

**Feature: human-rpc-python-sdk, Property 1: Configuration validation**
Tests that invalid configurations raise descriptive errors while valid 
configurations initialize successfully.
"""

import pytest
import os
import base58
from hypothesis import given, strategies as st
from solders.keypair import Keypair
from human_rpc_sdk import AutoAgent, SDKConfigurationError
from human_rpc_sdk.wallet import WalletManager


class TestConfigurationValidation:
    """Test configuration validation properties."""
    
    def test_valid_configuration_initializes_successfully(self, test_keypair):
        """Test that valid configurations initialize without errors."""
        # Valid private key (full 64 bytes)
        full_keypair_bytes = bytes(test_keypair)
        valid_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        # Should initialize successfully
        agent = AutoAgent(
            solana_private_key=valid_private_key,
            network="devnet",
            timeout=10
        )
        
        assert agent is not None
        assert agent.network == "devnet"
        assert agent.timeout == 10
    
    def test_missing_private_key_raises_error(self):
        """Test that missing private key raises descriptive error."""
        # Clear environment variable
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        if "SOLANA_PRIVATE_KEY" in os.environ:
            del os.environ["SOLANA_PRIVATE_KEY"]
        
        try:
            with pytest.raises(SDKConfigurationError) as exc_info:
                AutoAgent()
            
            error_msg = str(exc_info.value)
            assert "SOLANA_PRIVATE_KEY" in error_msg
            assert "required" in error_msg.lower()
            
        finally:
            # Restore environment
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
    
    @given(st.text(min_size=1, max_size=100))
    def test_invalid_private_key_raises_error(self, invalid_key):
        """
        **Feature: human-rpc-python-sdk, Property 1: Configuration validation**
        
        Property: For any invalid private key string, initialization should 
        raise SDKConfigurationError with descriptive message.
        """
        # Skip valid base58 strings that might accidentally be valid keys
        try:
            decoded = base58.b58decode(invalid_key)
            if len(decoded) == 64:
                # This might be a valid key, skip it
                return
        except:
            pass  # Invalid base58, which is what we want to test
        
        with pytest.raises(SDKConfigurationError) as exc_info:
            AutoAgent(solana_private_key=invalid_key)
        
        error_msg = str(exc_info.value)
        assert "Failed to load private key" in error_msg or "invalid" in error_msg.lower()
    
    @given(st.integers(min_value=-1000, max_value=0))
    def test_invalid_timeout_values(self, invalid_timeout):
        """
        **Feature: human-rpc-python-sdk, Property 1: Configuration validation**
        
        Property: For any non-positive timeout value, the system should handle
        it gracefully (either reject or use a default).
        """
        # Create a valid private key for this test
        test_keypair = Keypair()
        full_keypair_bytes = bytes(test_keypair)
        valid_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        # Invalid timeout should either be rejected or defaulted
        if invalid_timeout <= 0:
            # The system should either reject invalid timeouts or use a default
            agent = AutoAgent(
                solana_private_key=valid_private_key,
                timeout=invalid_timeout
            )
            # If it doesn't raise an error, it should use a reasonable default
            assert agent.timeout > 0  # Should not accept negative/zero timeouts
    
    @given(st.text(min_size=1, max_size=50))
    def test_network_parameter_handling(self, network_name):
        """
        **Feature: human-rpc-python-sdk, Property 1: Configuration validation**
        
        Property: For any network name string, the system should accept it
        and normalize it appropriately.
        """
        # Create a valid private key for this test
        test_keypair = Keypair()
        full_keypair_bytes = bytes(test_keypair)
        valid_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        # Should accept any network name
        agent = AutoAgent(
            solana_private_key=valid_private_key,
            network=network_name
        )
        
        assert agent.network == network_name
    
    def test_wallet_manager_configuration_validation(self):
        """Test WalletManager configuration validation."""
        # Test with no key provided and no environment variable
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        if "SOLANA_PRIVATE_KEY" in os.environ:
            del os.environ["SOLANA_PRIVATE_KEY"]
        
        try:
            with pytest.raises(SDKConfigurationError):
                WalletManager()
        finally:
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
    
    def test_wallet_manager_with_valid_key(self, test_keypair):
        """Test WalletManager with valid private key."""
        full_keypair_bytes = bytes(test_keypair)
        valid_private_key = base58.b58encode(full_keypair_bytes).decode()
        
        wallet = WalletManager(private_key=valid_private_key)
        
        assert wallet.get_public_key() is not None
        assert wallet.get_signer() is not None
    
    @given(st.text(min_size=1, max_size=100))
    def test_wallet_manager_invalid_key_property(self, invalid_key):
        """
        **Feature: human-rpc-python-sdk, Property 1: Configuration validation**
        
        Property: For any invalid private key, WalletManager should raise
        SDKConfigurationError with descriptive message.
        """
        # Skip potentially valid keys
        try:
            decoded = base58.b58decode(invalid_key)
            if len(decoded) == 64:
                return  # Skip potentially valid keys
        except:
            pass
        
        with pytest.raises(SDKConfigurationError) as exc_info:
            WalletManager(private_key=invalid_key)
        
        error_msg = str(exc_info.value)
        assert "Failed to load private key" in error_msg
    
    def test_environment_variable_precedence(self, test_keypair):
        """Test that constructor parameters override environment variables."""
        # Set up environment variable
        env_keypair = Keypair()
        env_full_bytes = bytes(env_keypair)
        env_private_key = base58.b58encode(env_full_bytes).decode()
        
        # Set up constructor parameter
        param_full_bytes = bytes(test_keypair)
        param_private_key = base58.b58encode(param_full_bytes).decode()
        
        original_key = os.environ.get("SOLANA_PRIVATE_KEY")
        os.environ["SOLANA_PRIVATE_KEY"] = env_private_key
        
        try:
            # Constructor parameter should override environment variable
            agent = AutoAgent(solana_private_key=param_private_key)
            
            # The agent should use the parameter key, not the environment key
            assert agent.wallet.get_public_key() == test_keypair.pubkey()
            
        finally:
            if original_key:
                os.environ["SOLANA_PRIVATE_KEY"] = original_key
            else:
                os.environ.pop("SOLANA_PRIVATE_KEY", None)