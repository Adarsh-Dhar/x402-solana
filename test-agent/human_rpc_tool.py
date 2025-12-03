#!/usr/bin/env python3
"""
Human RPC Tool - LangChain custom tool that handles payment on Solana
when the Human RPC API returns HTTP 402 Payment Required.
"""

import os
import json
import time
import requests
from typing import Optional
from dotenv import load_dotenv
from langchain.tools import tool
from solders.keypair import Keypair
from solders.system_program import transfer, TransferParams
from solders.transaction import Transaction
from solders.message import Message
from solders.pubkey import Pubkey
from solders.hash import Hash
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


def send_solana_payment(payment_address: str, amount_lamports: int) -> str:
    """
    Send a SOL payment transaction on Solana.
    
    Args:
        payment_address: The recipient's Solana address
        amount_lamports: Amount to send in lamports
        
    Returns:
        Transaction signature string
    """
    print(f"💸 Preparing Solana payment: {amount_lamports} lamports to {payment_address}")
    
    # Load wallet
    wallet = load_agent_wallet()
    rpc_url = get_solana_connection()
    
    # Convert string address to Pubkey
    to_pubkey = Pubkey.from_string(payment_address)
    from_pubkey = wallet.pubkey()
    
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
    
    # Create transfer instruction
    transfer_ix = transfer(
        TransferParams(
            from_pubkey=from_pubkey,
            to_pubkey=to_pubkey,
            lamports=amount_lamports
        )
    )
    
    # Create message with blockhash (new solders API)
    message = Message.new_with_blockhash([transfer_ix], from_pubkey, recent_blockhash)
    
    # Create unsigned transaction and sign it
    transaction = Transaction.new_unsigned(message)
    transaction.sign([wallet], recent_blockhash)
    
    # Send transaction via RPC
    print(f"📤 Sending transaction...")
    try:
        # Serialize transaction to base64
        tx_bytes = bytes(transaction)
        import base64
        tx_base64 = base64.b64encode(tx_bytes).decode('utf-8')
        
        # Send using JSON-RPC
        send_payload = {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "sendTransaction",
            "params": [
                tx_base64,
                {
                    "encoding": "base64",
                    "skipPreflight": False,
                    "preflightCommitment": "confirmed",
                    "maxRetries": 3
                }
            ]
        }
        
        send_response = requests.post(rpc_url, json=send_payload, timeout=30)
        send_data = send_response.json()
        
        if "error" in send_data:
            raise ValueError(f"RPC error: {send_data['error']}")
        
        signature = send_data.get("result")
        if not signature:
            raise ValueError(f"Unexpected response: {send_data}")
        
        print(f"✅ Transaction sent! Signature: {signature}")
        
        # Wait for confirmation
        print("⏳ Waiting for confirmation...")
        max_attempts = 30
        for attempt in range(max_attempts):
            try:
                status_payload = {
                    "jsonrpc": "2.0",
                    "id": 4 + attempt,
                    "method": "getSignatureStatuses",
                    "params": [[signature]]
                }
                status_response = requests.post(rpc_url, json=status_payload, timeout=10)
                status_data = status_response.json()
                statuses = status_data.get("result", {}).get("value", [])
                
                if statuses and len(statuses) > 0:
                    status = statuses[0]
                    if status and status.get("err") is None:
                        print(f"✅ Transaction confirmed!")
                        return signature
                    elif status and status.get("err"):
                        raise ValueError(f"Transaction failed: {status.get('err')}")
                
                time.sleep(1)
            except Exception as e:
                if attempt < max_attempts - 1:
                    time.sleep(1)
                    continue
                else:
                    print(f"⚠️  Could not confirm transaction, but signature is: {signature}")
                    return signature
        
        print(f"⚠️  Confirmation timeout, but signature is: {signature}")
        return signature
        
    except Exception as e:
        raise ValueError(f"Failed to send transaction: {e}")


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
            print("💳 Payment required (402). Processing Solana payment...")
            
            try:
                # Parse payment details from response
                # Debug: Log 402 response
                print(f"📊 402 Response Text: {response.text[:500]}")
                try:
                    payment_info = response.json()
                except json.JSONDecodeError as e:
                    raise ValueError(
                        f"Failed to parse 402 payment response. Response text: {response.text[:500]}, Error: {e}"
                    )
                payment_address = payment_info.get("payment_address")
                amount_sol = payment_info.get("amount")  # Amount in SOL
                
                if not payment_address or amount_sol is None:
                    raise ValueError(
                        f"Invalid payment response. Expected 'payment_address' and 'amount'. "
                        f"Got: {payment_info}"
                    )
                
                # Convert SOL to lamports (multiply by 1e9)
                amount_lamports = int(amount_sol * 1_000_000_000)
                
                print(f"📋 Payment details:")
                print(f"   Address: {payment_address}")
                print(f"   Amount: {amount_sol} SOL ({amount_lamports} lamports)")
                
                # Send Solana payment
                tx_signature = send_solana_payment(payment_address, amount_lamports)
                
                # Wait a moment for transaction to propagate
                time.sleep(2)
                
                # Retry the request with payment signature header (lowercase)
                print(f"🔄 Retrying request with payment signature...")
                headers["x-payment-signature"] = tx_signature
                
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
                
                if retry_response.status_code in [200, 202]:
                    print("✅ Human RPC analysis complete!")
                    # Handle empty responses gracefully
                    if not retry_response.text or len(retry_response.text.strip()) == 0:
                        raise ValueError(
                            f"Empty response body received. Status: {retry_response.status_code}, "
                            f"Headers: {dict(retry_response.headers)}"
                        )
                    try:
                        return retry_response.json()
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
            print("✅ Human RPC analysis complete!")
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
                return response.json()
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

