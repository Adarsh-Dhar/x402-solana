#!/usr/bin/env python3
"""
Utility script to generate a new Solana keypair and print the private key.
Use this to generate a private key for the AGENT_PRIVATE_KEY in .env file.
"""

from solders.keypair import Keypair
import base58


def generate_keypair():
    """Generate a new Solana keypair and return the keypair and private key string."""
    # Generate a new random keypair
    keypair = Keypair()
    
    # Get the private key bytes
    private_key_bytes = bytes(keypair)
    
    # Encode to base58 for easy storage
    private_key_base58 = base58.b58encode(private_key_bytes).decode('utf-8')
    
    # Get the public key
    public_key = str(keypair.pubkey())
    
    return keypair, private_key_base58, public_key


if __name__ == "__main__":
    print("=" * 60)
    print("Solana Keypair Generator")
    print("=" * 60)
    print()
    
    keypair, private_key, public_key = generate_keypair()
    
    print("✅ New keypair generated successfully!")
    print()
    print("Public Key (Address):")
    print(f"  {public_key}")
    print()
    print("Private Key (base58) - Add this to your .env file as AGENT_PRIVATE_KEY:")
    print(f"  {private_key}")
    print()
    print("⚠️  WARNING: Keep this private key secure! Never share it publicly.")
    print("=" * 60)

