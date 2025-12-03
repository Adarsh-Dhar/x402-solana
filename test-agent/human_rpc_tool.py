#!/usr/bin/env python3
"""
Human RPC Tool - LangChain custom tool that handles payment on Solana
when the Human RPC API returns HTTP 402 Payment Required.
"""

import os
import json
import time
import requests
import base64
from typing import Optional
from dotenv import load_dotenv
from langchain.tools import tool
from solders.keypair import Keypair
from solders.system_program import transfer, TransferParams
from solders.transaction import Transaction
from solders.message import Message
from solders.pubkey import Pubkey
from solders.hash import Hash
from solders.instruction import Instruction, AccountMeta
import base58

# Load environment variables
load_dotenv()


def get_solana_connection():
    """Get Solana RPC connection client using HTTP."""
    rpc_url = os.getenv("SOLANA_RPC_URL", "https://api.devnet.solana.com")
    return rpc_url


def load_agent_wallet() -> Keypair:
    """
    Load the agent wallet from environment variable.
    Supports both base58 encoded string and array format.
    """
    private_key_str = os.getenv("AGENT_PRIVATE_KEY")
    if not private_key_str:
        raise ValueError("AGENT_PRIVATE_KEY not found in environment variables")
    
    try:
        # Try to decode as base58 first
        private_key_bytes = base58.b58decode(private_key_str)
        return Keypair.from_bytes(private_key_bytes)
    except Exception:
        # If base58 fails, try parsing as JSON array
        try:
            private_key_array = json.loads(private_key_str)
            private_key_bytes = bytes(private_key_array)
            return Keypair.from_bytes(private_key_bytes)
        except Exception as e:
            raise ValueError(f"Could not parse AGENT_PRIVATE_KEY: {e}")


def derive_associated_token_address(wallet: Pubkey, mint: Pubkey) -> Pubkey:
    """
    Derive the associated token account address for a wallet and mint.
    Uses the standard SPL Token associated token account derivation.
    """
    # Associated token account derivation:
    # PDA with seeds: [wallet, TOKEN_PROGRAM_ID, mint]
    # Using the standard derivation method
    TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    ASSOCIATED_TOKEN_PROGRAM_ID = Pubkey.from_string("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
    
    # The seeds for ATA derivation are: [wallet, TOKEN_PROGRAM_ID, mint]
    seeds = [
        bytes(wallet),
        bytes(TOKEN_PROGRAM_ID),
        bytes(mint),
    ]
    
    # Find the program address using Pubkey.find_program_address
    address, _ = Pubkey.find_program_address(seeds, ASSOCIATED_TOKEN_PROGRAM_ID)
    return address


def send_usdc_payment(token_account: str, amount: int, mint_address: str = None) -> Transaction:
    """
    Build a USDC (SPL Token) payment transaction.
    
    Args:
        token_account: The recipient's associated token account address
        amount: Amount to send in token base units (e.g., 100 = 0.0001 USDC for 6 decimals)
        mint_address: USDC mint address (defaults to devnet USDC)
        
    Returns:
        Signed transaction ready to serialize
    """
    if mint_address is None:
        mint_address = os.getenv("USDC_MINT_ADDRESS", "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU")
    
    print(f"💸 Preparing USDC payment: {amount} base units to {token_account}")
    
    # Load wallet
    wallet = load_agent_wallet()
    rpc_url = get_solana_connection()
    
    # Convert addresses to Pubkeys
    to_token_account = Pubkey.from_string(token_account)
    mint_pubkey = Pubkey.from_string(mint_address)
    from_pubkey = wallet.pubkey()
    
    # Derive the sender's associated token account
    from_token_account = derive_associated_token_address(from_pubkey, mint_pubkey)
    
    # Get recent blockhash
    try:
        blockhash_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "getLatestBlockhash",
            "params": [{"commitment": "confirmed"}]
        }
        blockhash_response = requests.post(rpc_url, json=blockhash_payload, timeout=10)
        blockhash_data = blockhash_response.json()
        recent_blockhash_str = blockhash_data.get("result", {}).get("value", {}).get("blockhash")
        
        if not recent_blockhash_str:
            raise ValueError("Could not get recent blockhash from RPC")
        
        recent_blockhash = Hash.from_string(recent_blockhash_str)
    except Exception as e:
        raise ValueError(f"Could not get recent blockhash: {e}")
    
    # Build SPL Token Transfer instruction
    # Instruction format: [instruction_type (1 byte), amount (8 bytes, u64 little-endian)]
    TOKEN_PROGRAM_ID = Pubkey.from_string("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
    
    # Transfer instruction type is 3
    instruction_data = bytearray([3])  # Transfer instruction
    # Add amount as u64 little-endian
    instruction_data.extend(amount.to_bytes(8, 'little'))
    
    # Create instruction
    # Accounts: [source, destination, owner]
    transfer_ix = Instruction(
        program_id=TOKEN_PROGRAM_ID,
        data=bytes(instruction_data),
        accounts=[
            AccountMeta(pubkey=from_token_account, is_signer=False, is_writable=True),
            AccountMeta(pubkey=to_token_account, is_signer=False, is_writable=True),
            AccountMeta(pubkey=from_pubkey, is_signer=True, is_writable=False),
        ]
    )
    
    # Create message with blockhash
    message = Message.new_with_blockhash([transfer_ix], from_pubkey, recent_blockhash)
    
    # Create unsigned transaction and sign it
    transaction = Transaction.new_unsigned(message)
    transaction.sign([wallet], recent_blockhash)
    
    print(f"✅ USDC transaction built and signed")
    return transaction


def send_solana_payment(payment_address: str, amount_lamports: int) -> Transaction:
    """
    Build a SOL payment transaction on Solana.
    
    Args:
        payment_address: The recipient's Solana address
        amount_lamports: Amount to send in lamports
        
    Returns:
        Signed transaction ready to serialize
    """
    print(f"💸 Preparing Solana payment: {amount_lamports} lamports to {payment_address}")
    
    # Load wallet
    wallet = load_agent_wallet()
    rpc_url = get_solana_connection()
    
    # Convert string address to Pubkey
    to_pubkey = Pubkey.from_string(payment_address)
    
    # Use the agent's wallet address (hardcoded or from env var)
    # Default to the provided agent wallet address
    AGENT_WALLET_ADDRESS = os.getenv("AGENT_WALLET_ADDRESS", "6B2jLPadbxtn3mtMVfAxs8w2CtLrQiE1ZK2au4Zq9fpD")
    from_pubkey = Pubkey.from_string(AGENT_WALLET_ADDRESS)
    
    # Verify the wallet we're using can sign (it should match the loaded wallet)
    wallet_pubkey = wallet.pubkey()
    
    # Debug: Verify addresses
    print(f"🔍 Address verification:")
    print(f"   From (sender/agent): {from_pubkey}")
    print(f"   To (recipient/treasury): {to_pubkey}")
    print(f"   Loaded wallet address: {wallet_pubkey}")
    print(f"   Are from and to the same? {from_pubkey == to_pubkey}")
    
    if from_pubkey == to_pubkey:
        raise ValueError(f"ERROR: from_pubkey and to_pubkey are the same! Both are: {from_pubkey}")
    
    # Verify wallet can sign for from_pubkey
    if wallet_pubkey != from_pubkey:
        raise ValueError(
            f"ERROR: Loaded wallet address ({wallet_pubkey}) doesn't match agent address ({from_pubkey}). "
            f"Please ensure AGENT_PRIVATE_KEY corresponds to the agent wallet address."
        )
    
    # Check balance before sending using RPC
    try:
        balance_payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "getBalance",
            "params": [str(from_pubkey)]
        }
        balance_response = requests.post(rpc_url, json=balance_payload, timeout=10)
        balance_data = balance_response.json()
        balance = balance_data.get("result", {}).get("value", 0)
        print(f"💰 Current wallet balance: {balance} lamports")
        
        if balance < amount_lamports + 5000:  # Add buffer for fees
            raise ValueError(
                f"Insufficient funds. Need {amount_lamports + 5000} lamports, "
                f"but wallet has {balance} lamports."
            )
    except Exception as e:
        print(f"⚠️  Could not check balance: {e}")
        print("   Proceeding anyway...")
    
    # Get recent blockhash (refresh right before building transaction to avoid staleness)
    try:
        blockhash_payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "getLatestBlockhash",
            "params": [{"commitment": "finalized"}]  # Use finalized for more reliable blockhash
        }
        blockhash_response = requests.post(rpc_url, json=blockhash_payload, timeout=10)
        blockhash_data = blockhash_response.json()
        
        if "error" in blockhash_data:
            raise ValueError(f"RPC error getting blockhash: {blockhash_data['error']}")
        
        recent_blockhash_str = blockhash_data.get("result", {}).get("value", {}).get("blockhash")
        
        if not recent_blockhash_str:
            raise ValueError("Could not get recent blockhash from RPC")
        
        recent_blockhash = Hash.from_string(recent_blockhash_str)
        print(f"🔗 Using blockhash: {recent_blockhash_str[:16]}...")
    except Exception as e:
        raise ValueError(f"Could not get recent blockhash: {e}")
    
    # Use solders' built-in transfer function to create the instruction correctly
    # This ensures the instruction data format is correct
    if from_pubkey == to_pubkey:
        raise ValueError(f"ERROR: from_pubkey and to_pubkey are the same! Both are: {from_pubkey}")
    
    # Create transfer instruction using solders' transfer function
    # This will create the instruction with the correct data format
    transfer_ix = transfer(
        TransferParams(
            from_pubkey=from_pubkey,
            to_pubkey=to_pubkey,
            lamports=amount_lamports
        )
    )
    
    # Debug: Verify the instruction accounts
    print(f"🔍 Transfer instruction verification:")
    print(f"   Program ID: {transfer_ix.program_id}")
    print(f"   Data length: {len(transfer_ix.data)} bytes")
    if len(transfer_ix.data) > 0:
        print(f"   Data first byte: {transfer_ix.data[0]}")
    print(f"   Accounts count: {len(transfer_ix.accounts)}")
    
    # Check and fix account ordering if needed
    accounts_need_fix = False
    for i, acc in enumerate(transfer_ix.accounts):
        print(f"     Account {i}: {str(acc.pubkey)}, signer={acc.is_signer}, writable={acc.is_writable}")
        # Verify account matches expected
        if i == 0:
            if str(acc.pubkey) != str(from_pubkey):
                print(f"     ⚠️  WARNING: Account 0 should be from_pubkey ({from_pubkey}) but got {acc.pubkey}")
                accounts_need_fix = True
        elif i == 1:
            if str(acc.pubkey) != str(to_pubkey):
                print(f"     ⚠️  WARNING: Account 1 should be to_pubkey ({to_pubkey}) but got {acc.pubkey}")
                accounts_need_fix = True
    
    # If accounts are wrong, manually fix them while keeping the correct instruction data
    if accounts_need_fix:
        print(f"🔧 Fixing account order in instruction...")
        # Keep the instruction data (which is correct), but fix the accounts
        transfer_ix = Instruction(
            program_id=transfer_ix.program_id,
            data=transfer_ix.data,  # Keep the correct data from transfer()
            accounts=[
                AccountMeta(pubkey=from_pubkey, is_signer=True, is_writable=True),
                AccountMeta(pubkey=to_pubkey, is_signer=False, is_writable=True),
            ]
        )
        print(f"✅ Instruction accounts fixed")
        print(f"   Account 0: {str(transfer_ix.accounts[0].pubkey)} (should be {from_pubkey})")
        print(f"   Account 1: {str(transfer_ix.accounts[1].pubkey)} (should be {to_pubkey})")
    
    # Debug: Print instruction details
    print(f"🔍 Transfer instruction details:")
    print(f"   Program ID: {transfer_ix.program_id}")
    print(f"   Data length: {len(transfer_ix.data)} bytes")
    print(f"   Data first byte (discriminator): {transfer_ix.data[0]}")
    print(f"   Accounts: {len(transfer_ix.accounts)}")
    for i, acc in enumerate(transfer_ix.accounts):
        pubkey_str = str(acc.pubkey)  # Convert to string for display
        print(f"     Account {i}: {pubkey_str}, signer={acc.is_signer}, writable={acc.is_writable}")
    if len(transfer_ix.data) >= 9:
        amount_from_data = int.from_bytes(transfer_ix.data[1:9], 'little')
        print(f"   Amount from data: {amount_from_data} lamports")
    print(f"   Expected amount: {amount_lamports} lamports")
    
    # Create message with blockhash (new solders API)
    # The fee payer (from_pubkey) will be automatically added as the first account
    message = Message.new_with_blockhash([transfer_ix], from_pubkey, recent_blockhash)
    
    # Debug: Check message account keys
    print(f"🔍 Message account keys:")
    for i, key in enumerate(message.account_keys):
        key_str = str(key)  # Convert to string for display
        print(f"   Message account {i}: {key_str}")
    
    # Debug: Check instruction accounts after message creation
    print(f"🔍 Instruction accounts after message creation:")
    for i, acc in enumerate(transfer_ix.accounts):
        pubkey_str = str(acc.pubkey)  # Convert to string for display
        print(f"   Instruction account {i}: {pubkey_str}, signer={acc.is_signer}, writable={acc.is_writable}")
    
    # Create unsigned transaction and sign it
    transaction = Transaction.new_unsigned(message)
    transaction.sign([wallet], recent_blockhash)
    
    # Test: Try to simulate the transaction locally to verify it's valid
    try:
        simulate_payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "simulateTransaction",
            "params": [
                base64.b64encode(bytes(transaction)).decode('utf-8'),
                {
                    "encoding": "base64",
                    "commitment": "confirmed"
                }
            ]
        }
        simulate_response = requests.post(rpc_url, json=simulate_payload, timeout=10)
        simulate_data = simulate_response.json()
        
        if "error" in simulate_data:
            print(f"⚠️  Transaction simulation failed: {simulate_data['error']}")
        else:
            sim_result = simulate_data.get("result", {})
            if sim_result.get("value", {}).get("err"):
                print(f"⚠️  Transaction simulation error: {sim_result['value']['err']}")
            else:
                print(f"✅ Transaction simulation successful (local test)")
    except Exception as e:
        print(f"⚠️  Could not simulate transaction locally: {e}")
        print("   Proceeding anyway...")
    
    print(f"✅ SOL transaction built and signed")
    print(f"   Transaction has {len(transaction.signatures)} signature(s)")
    return transaction


def poll_task_status(task_id: str, max_wait_seconds: Optional[int] = None, poll_interval: int = 3) -> dict:
    """
    Poll task status until completion or optional timeout.
    
    Args:
        task_id: The task ID to poll
        max_wait_seconds: Maximum time to wait in seconds. If None, wait indefinitely.
        poll_interval: Time between polls in seconds (default: 3 seconds)
        
    Returns:
        Dictionary with task result containing sentiment and confidence
        
    Raises:
        ValueError: If polling times out (when max_wait_seconds is set) or fails
    """
    human_rpc_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    task_url = f"{human_rpc_url}/{task_id}"
    
    print(f"🔄 Waiting for human decision...")
    
    start_time = time.time()
    last_status_print = 0
    
    while True:
        elapsed = time.time() - start_time
        
        # Only enforce timeout if max_wait_seconds is explicitly set
        if max_wait_seconds is not None and elapsed >= max_wait_seconds:
            raise ValueError(
                f"Polling timeout after {max_wait_seconds}s. Task {task_id} did not complete."
            )
        
        try:
            response = requests.get(task_url, timeout=10)

            # Hard 404 → task truly missing
            if response.status_code == 404:
                raise ValueError(f"Task {task_id} not found")

            # Treat 5xx as transient server issues: log and keep polling
            if 500 <= response.status_code < 600:
                print(
                    f"⚠️  Polling error (server {response.status_code}). "
                    f"Response (truncated): {response.text[:120]}"
                )
                time.sleep(poll_interval)
                continue

            # Any other non-200 (e.g. 4xx) is treated as fatal
            if response.status_code != 200:
                raise ValueError(
                    f"Failed to poll task status. Status: {response.status_code}, "
                    f"Response: {response.text[:200]}"
                )
            
            task_data = response.json()
            status = task_data.get("status", "unknown")
            
            if status == "completed":
                result = task_data.get("result", {})
                if not result:
                    raise ValueError(f"Task completed but no result found")
                
                # Extract sentiment and confidence from result
                sentiment = result.get("sentiment", "UNKNOWN")
                confidence = result.get("confidence", 0.0)
                decision = result.get("decision", "unknown")
                
                print(f"✅ Human decision received!")
                print(f"   Decision: {decision}")
                print(f"   Sentiment: {sentiment}")
                print(f"   Confidence: {confidence}")
                
                # Return result in the same format as the original response
                return {
                    "status": "Task Completed",
                    "task_id": task_id,
                    "sentiment": sentiment,
                    "confidence": confidence,
                    "decision": decision,
                    "result": result,
                }
            
            # Task not completed yet, show waiting message every 10 seconds
            if elapsed - last_status_print >= 10:
                print(f"   Still waiting... ({int(elapsed)}s elapsed)")
                last_status_print = elapsed
            
            # Wait before next poll
            time.sleep(poll_interval)
            
        except requests.exceptions.RequestException as e:
            print(f"⚠️  Poll request failed: {e}")
            # Continue polling on network errors (up to timeout)
            time.sleep(poll_interval)
        except json.JSONDecodeError as e:
            raise ValueError(f"Failed to parse task status response: {e}")


def build_x402_payment_header(transaction: Transaction, network: str = "devnet") -> str:
    """
    Build x402-compliant X-PAYMENT header from a signed transaction.
    
    Args:
        transaction: Signed Solana transaction
        network: Network name (devnet, mainnet-beta, etc.)
        
    Returns:
        Base64-encoded x402 payment header string
    """
    # Serialize transaction to base64
    # Use serialize() method which returns the wire format
    try:
        tx_bytes = bytes(transaction)
    except Exception as e:
        # Fallback: try serialize method if available
        if hasattr(transaction, 'serialize'):
            tx_bytes = transaction.serialize()
        else:
            raise ValueError(f"Could not serialize transaction: {e}")
    
    serialized_transaction = base64.b64encode(tx_bytes).decode('utf-8')
    print(f"📦 Serialized transaction length: {len(tx_bytes)} bytes")
    
    # Build x402 payment payload
    payment_payload = {
        "x402Version": 1,
        "scheme": "solana",
        "network": network,
        "payload": {
            "serializedTransaction": serialized_transaction
        }
    }
    
    # Encode entire payload as base64
    payload_json = json.dumps(payment_payload)
    x402_header = base64.b64encode(payload_json.encode('utf-8')).decode('utf-8')
    
    return x402_header


@tool
def ask_human_rpc(
    text: str,
    agentName: str = "SentimentAI-Pro",
    reward: str = "0.3 USDC",
    rewardAmount: float = 0.3,
    category: str = "Analysis",
    escrowAmount: str = "0.6 USDC",
    context: dict = None
) -> dict:
    """
    Ask the Human RPC API to analyze text. If payment is required (HTTP 402),
    automatically handle the Solana payment and retry the request.
    
    Args:
        text: The text to analyze for sentiment
        agentName: Name of the agent creating the task
        reward: Reward amount as string (e.g., "0.3 USDC")
        rewardAmount: Reward amount as float
        category: Category of the task (e.g., "Analysis", "Trading")
        escrowAmount: Escrow amount as string (e.g., "0.6 USDC")
        context: Context dictionary with type, summary, and data fields
        
    Returns:
        Dictionary with sentiment analysis result from Human RPC API
    """
    human_rpc_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    
    print(f"🌐 Calling Human RPC API: {human_rpc_url}")
    print(f"📝 Text to analyze: \"{text}\"")
    print(f"🤖 Agent: {agentName}")
    print(f"💰 Reward: {reward}")
    
    # Prepare the request payload
    payload = {
        "text": text,
        "task_type": "sentiment_analysis",
        "agentName": agentName,
        "reward": reward,
        "rewardAmount": rewardAmount,
        "category": category,
        "escrowAmount": escrowAmount,
    }
    
    # Add context if provided
    if context:
        payload["context"] = context
    
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        # Initial request
        response = requests.post(human_rpc_url, json=payload, headers=headers, timeout=30)
        
        # Handle 402 Payment Required
        if response.status_code == 402:
            print("💳 Payment required (402). Processing x402 payment...")
            
            try:
                # Parse x402 payment response
                print(f"📊 402 Response Text: {response.text[:500]}")
                try:
                    payment_response = response.json()
                except json.JSONDecodeError as e:
                    raise ValueError(
                        f"Failed to parse 402 payment response. Response text: {response.text[:500]}, Error: {e}"
                    )
                
                # Extract payment object from response
                payment_info = payment_response.get("payment", {})
                if not payment_info:
                    raise ValueError(
                        f"Invalid payment response. Expected 'payment' object. Got: {payment_response}"
                    )
                
                # Determine payment type (SOL or USDC)
                recipient_wallet = payment_info.get("recipientWallet")
                token_account = payment_info.get("tokenAccount")
                mint = payment_info.get("mint")
                amount = payment_info.get("amount")
                cluster = payment_info.get("cluster", "devnet")
                
                # Determine network for x402 header
                network = "mainnet-beta" if "mainnet" in cluster else "devnet"
                
                transaction = None
                
                if token_account and mint:
                    # USDC payment
                    print(f"📋 USDC Payment details:")
                    print(f"   Token Account: {token_account}")
                    print(f"   Mint: {mint}")
                    print(f"   Amount: {amount} base units ({amount / 1_000_000} USDC)")
                    
                    if not amount:
                        raise ValueError("USDC payment amount is required")
                    
                    # Build USDC transaction
                    transaction = send_usdc_payment(token_account, amount, mint)
                    
                elif recipient_wallet and amount:
                    # SOL payment
                    amount_sol = payment_info.get("amountSOL")
                    if amount_sol is None:
                        # Amount might be in lamports
                        amount_sol = amount / 1_000_000_000
                    
                    amount_lamports = int(amount) if amount >= 1_000_000 else int(amount_sol * 1_000_000_000)
                    
                    print(f"📋 SOL Payment details:")
                    print(f"   Address: {recipient_wallet}")
                    print(f"   Amount: {amount_sol} SOL ({amount_lamports} lamports)")
                    
                    # Build SOL transaction
                    transaction = send_solana_payment(recipient_wallet, amount_lamports)
                else:
                    raise ValueError(
                        f"Invalid payment response. Missing required fields. Got: {payment_info}"
                    )
                
                if not transaction:
                    raise ValueError("Failed to build payment transaction")
                
                # Build x402-compliant payment header
                print(f"🔨 Building x402 payment header...")
                x402_header = build_x402_payment_header(transaction, network)
                
                # Retry the request with x402 X-PAYMENT header
                print(f"🔄 Retrying request with x402 X-PAYMENT header...")
                headers["X-PAYMENT"] = x402_header
                
                retry_response = requests.post(
                    human_rpc_url,
                    json=payload,
                    headers=headers,
                    timeout=30
                )
                
                # Debug: Log response details
                print(f"📊 Response Status: {retry_response.status_code}")
                print(f"📊 Response Headers: {dict(retry_response.headers)}")
                print(f"📊 Response Text (first 500 chars): {retry_response.text[:500]}")
                
                if retry_response.status_code == 200:
                    print("✅ Task created successfully!")
                    # Handle empty responses gracefully
                    if not retry_response.text or len(retry_response.text.strip()) == 0:
                        raise ValueError(
                            f"Empty response body received. Status: {retry_response.status_code}, "
                            f"Headers: {dict(retry_response.headers)}"
                        )
                    try:
                        task_response = retry_response.json()
                        task_id = task_response.get("task_id")
                        
                        if not task_id:
                            raise ValueError("Task created but no task_id in response")
                        
                        print(f"📋 Task ID: {task_id}")
                        print("⏳ Waiting for human decision...")
                        
                        # Poll for task completion
                        return poll_task_status(task_id)
                    except json.JSONDecodeError as e:
                        raise ValueError(
                            f"Failed to parse JSON response. Status: {retry_response.status_code}, "
                            f"Response text: {retry_response.text[:500]}, Error: {e}"
                        )
                else:
                    raise ValueError(
                        f"Request failed after payment. Status: {retry_response.status_code}, "
                        f"Response: {retry_response.text[:500]}"
                    )
                    
            except Exception as e:
                raise ValueError(f"Payment processing failed: {e}")
        
        # Handle other status codes
        elif response.status_code in [200, 202]:
            print("✅ Task created successfully!")
            # Debug: Log response details
            print(f"📊 Response Status: {response.status_code}")
            print(f"📊 Response Text (first 500 chars): {response.text[:500]}")
            
            # Handle empty responses gracefully
            if not response.text or len(response.text.strip()) == 0:
                raise ValueError(
                    f"Empty response body received. Status: {response.status_code}, "
                    f"Headers: {dict(response.headers)}"
                )
            try:
                task_response = response.json()
                task_id = task_response.get("task_id")
                
                if not task_id:
                    raise ValueError("Task created but no task_id in response")
                
                print(f"📋 Task ID: {task_id}")
                print("⏳ Waiting for human decision...")
                
                # Poll for task completion
                return poll_task_status(task_id)
            except json.JSONDecodeError as e:
                raise ValueError(
                    f"Failed to parse JSON response. Status: {response.status_code}, "
                    f"Response text: {response.text[:500]}, Error: {e}"
                )
        else:
            # Debug: Log error response details
            print(f"❌ Error Response Status: {response.status_code}")
            print(f"❌ Error Response Headers: {dict(response.headers)}")
            print(f"❌ Error Response Text: {response.text[:500]}")
            raise ValueError(
                f"Unexpected status code: {response.status_code}. "
                f"Response: {response.text[:500]}"
            )
            
    except requests.exceptions.RequestException as e:
        raise ValueError(f"HTTP request failed: {e}")
    except Exception as e:
        raise ValueError(f"Unexpected error: {e}")


if __name__ == "__main__":
    # Test the tool
    print("Testing Human RPC Tool...")
    test_text = "Wow, great job team. Another delay. Bullish!"
    result = ask_human_rpc.invoke({"text": test_text})
    print(f"Result: {json.dumps(result, indent=2)}")

