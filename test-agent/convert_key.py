#!/usr/bin/env python3
"""
Convert byte array private key to base58 format for Solana.
"""

import base58

# The private key as byte array from .env file
private_key_bytes = [45,149,61,5,204,56,196,192,60,25,77,212,175,199,117,228,107,169,189,192,240,153,58,214,197,52,52,103,211,21,131,60,76,220,50,223,224,151,40,205,132,105,92,74,207,5,176,156,204,114,90,29,25,65,159,252,92,155,41,104,211,109,174,10]

# Convert to bytes
key_bytes = bytes(private_key_bytes)

# Encode to base58
base58_key = base58.b58encode(key_bytes).decode('utf-8')

print(f"Base58 encoded private key: {base58_key}")
print(f"Length: {len(base58_key)} characters")

# Verify it can be decoded back
try:
    decoded = base58.b58decode(base58_key)
    print(f"✅ Verification successful - decoded length: {len(decoded)} bytes")
    print(f"Original matches: {list(decoded) == private_key_bytes}")
except Exception as e:
    print(f"❌ Verification failed: {e}")