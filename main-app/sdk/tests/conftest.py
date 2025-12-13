"""
Pytest configuration and fixtures for human-rpc-sdk tests.

Provides common fixtures and test utilities for unit and integration tests.
"""

import pytest
import os
from solders.keypair import Keypair
from human_rpc_sdk import AutoAgent
from human_rpc_sdk.wallet import WalletManager


# Test keypair for deterministic testing
TEST_PRIVATE_KEY = "5J7XKqzVNbwP4Nt8Z9Qx2Ry3Wv4Ux6Ty7Sz8Qw9Ex0Dy1Cz2Bx3Ay4Vz5Uw6Tx7Sy8Rz9Qy0Ex1Dy2Cz3Bx4Ay5Vz"


@pytest.fixture
def test_keypair():
    """Provide a deterministic test keypair."""
    # Create a deterministic keypair for testing
    seed = b"test_seed_for_human_rpc_sdk_testing_only" + b"\x00" * 8  # Pad to 32 bytes
    return Keypair.from_seed(seed[:32])


@pytest.fixture
def test_wallet(test_keypair):
    """Provide a test wallet manager."""
    # Temporarily set environment variable
    original_key = os.environ.get("SOLANA_PRIVATE_KEY")
    
    # Use the test keypair's full 64-byte representation
    import base58
    full_keypair_bytes = bytes(test_keypair)  # This gives us the full 64 bytes
    test_private_key = base58.b58encode(full_keypair_bytes).decode()
    
    os.environ["SOLANA_PRIVATE_KEY"] = test_private_key
    
    try:
        wallet = WalletManager()
        yield wallet
    finally:
        # Restore original environment
        if original_key:
            os.environ["SOLANA_PRIVATE_KEY"] = original_key
        else:
            os.environ.pop("SOLANA_PRIVATE_KEY", None)


@pytest.fixture
def test_agent(test_wallet):
    """Provide a test AutoAgent instance."""
    return AutoAgent(network="devnet", timeout=5)


@pytest.fixture
def mock_rpc_response():
    """Provide mock RPC response data."""
    return {
        "jsonrpc": "2.0",
        "result": {
            "value": {
                "blockhash": "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N",
                "lastValidBlockHeight": 200000000
            }
        },
        "id": 1
    }


@pytest.fixture
def sample_invoice_sol():
    """Provide a sample SOL invoice."""
    return {
        "status": "payment_required",
        "invoice": {
            "amount": 1000000,  # 0.001 SOL in lamports
            "currency": "SOL",
            "recipient": "11111111111111111111111111111112",
            "network": "devnet"
        },
        "message": "0.001 SOL required to unlock content"
    }


@pytest.fixture
def sample_invoice_usdc():
    """Provide a sample USDC invoice."""
    return {
        "status": "payment_required", 
        "invoice": {
            "amount": 300000,  # 0.3 USDC in base units
            "currency": "USDC",
            "mint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "recipient": "11111111111111111111111111111112",
            "network": "devnet"
        },
        "message": "0.3 USDC required to unlock content"
    }


@pytest.fixture
def sample_ai_result():
    """Provide a sample AI function result."""
    return {
        "answer": "POSITIVE",
        "confidence": 0.75,
        "reasoning": "The text contains positive sentiment indicators"
    }