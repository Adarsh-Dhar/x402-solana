"""
Solana transaction building and signing utilities.

Provides functions for building SOL transfers, SPL token transfers,
and transaction serialization for the x402 payment protocol.
"""

import base64
import requests
from typing import Optional
from solders.transaction import Transaction
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.message import Message
from solders.instruction import Instruction, AccountMeta
from solders.system_program import transfer, TransferParams
from solders.keypair import Keypair

from .exceptions import TransactionBuildError, PaymentError

# Solana program constants
TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")

# Default RPC URLs
DEFAULT_MAINNET_RPC_URL = "https://api.devnet.solana.com"
DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com"


def get_rpc_url(network: str) -> str:
    """
    Get appropriate RPC URL for the network.
    
    Args:
        network: Network name (mainnet-beta, devnet, etc.)
        
    Returns:
        RPC URL string
    """
    import os
    
    # Check for global override first
    global_rpc = os.getenv("SOLANA_RPC_URL")
    if global_rpc:
        return global_rpc
    
    # Check for network-specific override
    if "devnet" in network.lower():
        return os.getenv("SOLANA_DEVNET_RPC_URL", DEFAULT_DEVNET_RPC_URL)
    
    return os.getenv("SOLANA_MAINNET_RPC_URL", DEFAULT_MAINNET_RPC_URL)


def get_recent_blockhash(network: str = "devnet") -> Hash:
    """
    Get recent blockhash from Solana RPC.
    
    Args:
        network: Network name for RPC selection
        
    Returns:
        Recent blockhash
        
    Raises:
        TransactionBuildError: If RPC call fails
    """
    rpc_url = get_rpc_url(network)
    
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getLatestBlockhash",
            "params": [{"commitment": "confirmed"}]
        }
        
        response = requests.post(rpc_url, json=payload, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if "error" in data:
            raise TransactionBuildError(f"RPC error: {data['error']}")
        
        blockhash_str = data.get("result", {}).get("value", {}).get("blockhash")
        
        if not blockhash_str:
            raise TransactionBuildError("Could not get recent blockhash from RPC")
        
        return Hash.from_string(blockhash_str)
        
    except requests.RequestException as e:
        raise TransactionBuildError(f"Failed to get recent blockhash: {e}")
    except Exception as e:
        raise TransactionBuildError(f"Unexpected error getting blockhash: {e}")


def derive_associated_token_address(wallet: Pubkey, mint: Pubkey) -> Pubkey:
    """
    Derive associated token account address.
    
    Args:
        wallet: Wallet public key
        mint: Token mint public key
        
    Returns:
        Associated token account address
    """
    seeds = [
        bytes(wallet),
        bytes(TOKEN_PROGRAM_ID),
        bytes(mint),
    ]
    
    address, _ = Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)
    return address


def build_sol_transfer(
    sender_keypair: Keypair,
    recipient_pubkey: Pubkey,
    lamports: int,
    recent_blockhash: Optional[Hash] = None,
    network: str = "devnet"
) -> Transaction:
    """
    Build a SOL transfer transaction.
    
    Args:
        sender_keypair: Sender's keypair for signing
        recipient_pubkey: Recipient's public key
        lamports: Amount to transfer in lamports
        recent_blockhash: Recent blockhash (fetched if not provided)
        network: Network for RPC calls
        
    Returns:
        Unsigned transaction
        
    Raises:
        TransactionBuildError: If transaction building fails
    """
    try:
        if recent_blockhash is None:
            recent_blockhash = get_recent_blockhash(network)
        
        # Validate addresses
        sender_pubkey = sender_keypair.pubkey()
        if sender_pubkey == recipient_pubkey:
            raise TransactionBuildError("Cannot send SOL to self")
        
        # Build transfer instruction
        transfer_ix = transfer(
            TransferParams(
                from_pubkey=sender_pubkey,
                to_pubkey=recipient_pubkey,
                lamports=lamports
            )
        )
        
        # Build message and transaction
        message = Message.new_with_blockhash([transfer_ix], sender_pubkey, recent_blockhash)
        transaction = Transaction.new_unsigned(message)
        
        return transaction
        
    except Exception as e:
        raise TransactionBuildError(f"Failed to build SOL transfer: {e}")


def build_spl_transfer(
    sender_keypair: Keypair,
    recipient_ata: Pubkey,
    mint_pubkey: Pubkey,
    amount: int,
    recent_blockhash: Optional[Hash] = None,
    network: str = "devnet"
) -> Transaction:
    """
    Build an SPL token transfer transaction.
    
    Args:
        sender_keypair: Sender's keypair for signing
        recipient_ata: Recipient's associated token account
        mint_pubkey: Token mint public key
        amount: Amount to transfer in token base units
        recent_blockhash: Recent blockhash (fetched if not provided)
        network: Network for RPC calls
        
    Returns:
        Unsigned transaction
        
    Raises:
        TransactionBuildError: If transaction building fails
    """
    try:
        if recent_blockhash is None:
            recent_blockhash = get_recent_blockhash(network)
        
        sender_pubkey = sender_keypair.pubkey()
        
        # Derive sender's associated token account
        sender_ata = derive_associated_token_address(sender_pubkey, mint_pubkey)
        
        # Build SPL token transfer instruction
        # Transfer instruction type is 3
        instruction_data = bytearray([3])  # Transfer instruction
        instruction_data.extend(amount.to_bytes(8, 'little'))
        
        transfer_ix = Instruction(
            program_id=TOKEN_PROGRAM_ID,
            data=bytes(instruction_data),
            accounts=[
                AccountMeta(pubkey=sender_ata, is_signer=False, is_writable=True),
                AccountMeta(pubkey=recipient_ata, is_signer=False, is_writable=True),
                AccountMeta(pubkey=sender_pubkey, is_signer=True, is_writable=False),
            ]
        )
        
        # Build message and transaction
        message = Message.new_with_blockhash([transfer_ix], sender_pubkey, recent_blockhash)
        transaction = Transaction.new_unsigned(message)
        
        return transaction
        
    except Exception as e:
        raise TransactionBuildError(f"Failed to build SPL transfer: {e}")


def sign_and_serialize_transaction(transaction: Transaction, keypair: Keypair) -> str:
    """
    Sign transaction and serialize to base64.
    
    Args:
        transaction: Unsigned transaction
        keypair: Keypair for signing
        
    Returns:
        Base64-encoded signed transaction
        
    Raises:
        TransactionBuildError: If signing or serialization fails
    """
    try:
        # Get the recent blockhash from the transaction
        recent_blockhash = transaction.message.recent_blockhash
        
        # Sign the transaction
        transaction.sign([keypair], recent_blockhash)
        
        # Serialize and encode
        serialized = bytes(transaction)
        encoded = base64.b64encode(serialized).decode('utf-8')
        
        return encoded
        
    except Exception as e:
        raise TransactionBuildError(f"Failed to sign and serialize transaction: {e}")


def build_payment_transaction(
    sender_keypair: Keypair,
    recipient: str,
    amount: int,
    currency: str = "SOL",
    mint: Optional[str] = None,
    network: str = "devnet"
) -> str:
    """
    Build and sign a payment transaction based on currency type.
    
    Args:
        sender_keypair: Sender's keypair
        recipient: Recipient address (wallet for SOL, ATA for SPL)
        amount: Amount in base units (lamports for SOL, token units for SPL)
        currency: Currency type ("SOL" or SPL token name)
        mint: Mint address for SPL tokens
        network: Network name
        
    Returns:
        Base64-encoded signed transaction
        
    Raises:
        TransactionBuildError: If transaction building fails
        PaymentError: If payment validation fails
    """
    try:
        recipient_pubkey = Pubkey.from_string(recipient)
        
        if currency == "SOL":
            transaction = build_sol_transfer(
                sender_keypair=sender_keypair,
                recipient_pubkey=recipient_pubkey,
                lamports=amount,
                network=network
            )
        else:
            # SPL token transfer
            if not mint:
                raise PaymentError(f"Mint address required for {currency} payments")
            
            mint_pubkey = Pubkey.from_string(mint)
            transaction = build_spl_transfer(
                sender_keypair=sender_keypair,
                recipient_ata=recipient_pubkey,
                mint_pubkey=mint_pubkey,
                amount=amount,
                network=network
            )
        
        return sign_and_serialize_transaction(transaction, sender_keypair)
        
    except Exception as e:
        if isinstance(e, (TransactionBuildError, PaymentError)):
            raise
        raise TransactionBuildError(f"Failed to build payment transaction: {e}")


def create_payment_header(serialized_transaction: str, network: str = "devnet") -> dict:
    """
    Create X-PAYMENT header payload for x402 protocol.
    
    Args:
        serialized_transaction: Base64-encoded signed transaction
        network: Network name
        
    Returns:
        Payment header dictionary
    """
    return {
        "x402Version": 1,
        "scheme": "solana",
        "network": network,
        "payload": {
            "serializedTransaction": serialized_transaction
        }
    }