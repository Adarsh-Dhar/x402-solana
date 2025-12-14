import requests
import base64
import json
import time
import os
from typing import Optional
from .wallet import WalletManager
from .payment import PaymentCore


class AutoAgent:
    """
    Autonomous Payment Agent for x402 protocol.
    
    Automatically intercepts 402 Payment Required responses and handles
    Solana payments (SOL or USDC) to unlock paywalled content.
    """
    
    def __init__(self, human_rpc_url: Optional[str] = None):
        """
        Initialize the AutoAgent.
        
        Args:
            human_rpc_url: Optional Human RPC endpoint URL.
                          Defaults to HUMAN_RPC_URL env var or localhost.
        """
        self.wallet = WalletManager()
        self.pay_engine = PaymentCore(self.wallet)
        self.session = requests.Session()
        self.human_rpc_url = human_rpc_url or os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")

    def get(self, url, **kwargs):
        """Make a GET request. Automatically handles 402 payments."""
        return self._request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        """Make a POST request. Automatically handles 402 payments."""
        return self._request("POST", url, **kwargs)

    def _request(self, method, url, **kwargs):
        """
        Internal request method that intercepts 402 responses and handles payments.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            **kwargs: Additional arguments passed to requests (headers, json, data, etc.)
            
        Returns:
            Response object from requests library
        """
        # 1. Try the request normally
        response = self.session.request(method, url, **kwargs)

        # 2. Intercept 402
        if response.status_code == 402:
            print("[*] Paywall detected. Negotiating...")

            try:
                # A. Parse the Invoice
                # Supports both standard x402 format and Human RPC format
                data = response.json()
                payment_info = data.get("payment") or (data.get("accepts", [{}])[0] if data.get("accepts") else {})
                
                if not payment_info:
                    raise ValueError(
                        f"Invalid payment response. Expected 'payment' object or 'accepts' array. Got: {data}"
                    )

                # Determine payment type for logging
                token_account = payment_info.get("tokenAccount")
                recipient_wallet = payment_info.get("recipientWallet")
                amount = payment_info.get("amount")
                
                if token_account:
                    payment_type = "USDC"
                    payment_desc = f"{amount / 1_000_000} USDC to {token_account}"
                elif recipient_wallet:
                    payment_type = "SOL"
                    # Amount might be in lamports or SOL
                    amount_sol = payment_info.get("amountSOL")
                    if amount_sol:
                        payment_desc = f"{amount_sol} SOL to {recipient_wallet}"
                    else:
                        payment_desc = f"{amount / 1_000_000_000} SOL to {recipient_wallet}"
                else:
                    raise ValueError(
                        "Invalid payment response. Missing required fields. "
                        "For USDC: tokenAccount and mint required. "
                        "For SOL: recipientWallet required."
                    )

                print(f"[*] Payment required: {payment_desc}")

                # B. Build the Payment (pass full payment_info dict)
                # The build_payment_payload method will automatically detect SOL vs USDC
                payload = self.pay_engine.build_payment_payload(payment_info)

                # C. Encode Header
                # The payload must be base64 encoded into the header value
                json_str = json.dumps(payload)
                b64_header = base64.b64encode(json_str.encode()).decode()

                # D. Replay Request with X-PAYMENT header
                headers = kwargs.get('headers', {})
                if headers is None:
                    headers = {}
                
                # Ensure headers is a dict (not a string)
                if isinstance(headers, str):
                    headers = {}
                
                headers['X-PAYMENT'] = b64_header
                kwargs['headers'] = headers

                print(f"[*] {payment_type} payment sent. Retrying...")
                retry_response = self.session.request(method, url, **kwargs)
                
                # If retry still returns 402, payment verification likely failed
                if retry_response.status_code == 402:
                    raise ValueError(
                        f"Payment verification failed. The payment transaction was sent but not accepted by the server.\n"
                        f"Please ensure your agent wallet ({self.wallet.get_public_key()}) has sufficient funds.\n"
                        f"Required: {payment_desc}\n"
                        f"Wallet address: {self.wallet.get_public_key()}"
                    )
                
                return retry_response

            except ValueError as e:
                # Re-raise ValueError (these are our payment errors with clear messages)
                raise
            except Exception as e:
                print(f"[*] Payment processing failed: {e}")
                # Raise exception with clear message about funding the wallet
                # This prevents the 402 from being returned and causing confusion
                raise ValueError(
                    f"Payment failed: {e}\n"
                    f"Please fund your agent wallet ({self.wallet.get_public_key()}) with the required amount.\n"
                    f"For SOL payments: Send SOL to the wallet address.\n"
                    f"For USDC payments: Send USDC to the wallet address (it will be in an associated token account).\n"
                    f"Wallet address: {self.wallet.get_public_key()}"
                ) from e

        return response

    def poll_task_status(self, task_id: str, max_wait_seconds: Optional[int] = None, poll_interval: int = 3) -> dict:
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
        # Use query parameter approach as workaround for Next.js dynamic route issue
        task_url = f"{self.human_rpc_url}?taskId={task_id}"
        
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
                response = self.get(task_url, timeout=10)

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

    def ask_human_rpc(
        self,
        text: str,
        agentName: str = "SentimentAI-Pro",
        reward: str = "0.3 USDC", # give choice to user
        rewardAmount: float = 0.3, # give choice to user
        category: str = "Analysis",
        escrowAmount: str = "0.6 USDC", # give choice to user
        context: dict = None
    ) -> dict:
        """
        Ask the Human RPC API to analyze text. Automatically handles 402 payments
        and polls for task completion.
        
        Args:
            text: The text to analyze for sentiment
            agentName: Name of the agent creating the task
            reward: Reward amount as string (e.g., "0.3 USDC")
            rewardAmount: Reward amount as float
            category: Category of the task (e.g., "Analysis", "Trading")
            escrowAmount: Escrow amount as string (e.g., "0.6 USDC")
            context: Context dictionary with type, summary, and data fields.
                     The data field must contain: userQuery, agentConclusion, confidence, reasoning
            
        Returns:
            Dictionary with sentiment analysis result from Human RPC API
        """
        print(f"🌐 Calling Human RPC API: {self.human_rpc_url}")
        print(f"📝 Text to analyze: \"{text}\"")
        print(f"🤖 Agent: {agentName}")
        print(f"💰 Reward: {reward}")
        
        # Validate context structure if provided
        if context:
            if not isinstance(context, dict):
                raise ValueError("Context must be a dictionary")
            
            if "data" not in context:
                raise ValueError("Context must contain 'data' field")
            
            data = context["data"]
            if not isinstance(data, dict):
                raise ValueError("Context.data must be a dictionary")
            
            # Validate required fields
            required_fields = ["userQuery", "agentConclusion", "confidence", "reasoning"]
            missing_fields = [field for field in required_fields if field not in data]
            
            if missing_fields:
                raise ValueError(
                    f"Context.data is missing required fields: {', '.join(missing_fields)}. "
                    f"Required fields: {', '.join(required_fields)}"
                )
            
            # Validate field types
            if not isinstance(data["userQuery"], str) or not data["userQuery"].strip():
                raise ValueError("userQuery must be a non-empty string")
            
            if not isinstance(data["agentConclusion"], str) or not data["agentConclusion"].strip():
                raise ValueError("agentConclusion must be a non-empty string")
            
            confidence = data["confidence"]
            if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
                raise ValueError("confidence must be a number between 0 and 1")
            
            if not isinstance(data["reasoning"], str) or not data["reasoning"].strip():
                raise ValueError("reasoning must be a non-empty string")
            
            print("✅ Context validation passed")
            print(f"   User Query: {data['userQuery'][:50]}...")
            print(f"   Agent Conclusion: {data['agentConclusion']}")
            print(f"   Confidence: {confidence:.3f}")
            print(f"   Reasoning: {data['reasoning'][:100]}...")
        else:
            raise ValueError("Context is required. Must include userQuery, agentConclusion, confidence, and reasoning.")
        
        # Prepare the request payload
        payload = {
            "text": text,
            "task_type": "sentiment_analysis",
            "agentName": agentName,
            "reward": reward,
            "rewardAmount": rewardAmount,
            "category": category,
            "escrowAmount": escrowAmount,
            "context": context
        }
        
        headers = {
            "Content-Type": "application/json"
        }
        
        try:
            # Make request using SDK (automatically handles 402 payments)
            response = self.post(self.human_rpc_url, json=payload, headers=headers, timeout=30)
            
            # Debug: Log response details
            print(f"📊 Response Status: {response.status_code}")
            print(f"📊 Response Headers: {dict(response.headers)}")
            print(f"📊 Response Text (first 500 chars): {response.text[:500]}")
            
            # If we still get 402, payment failed (should have been handled by _request)
            # This is a fallback in case payment exception wasn't raised properly
            if response.status_code == 402:
                try:
                    payment_info = response.json().get("payment", {})
                    payment_type = "USDC" if payment_info.get("tokenAccount") else "SOL"
                    amount = payment_info.get("amountSOL") or (payment_info.get("amount", 0) / 1_000_000_000)
                    
                    raise ValueError(
                        f"Payment failed. Unable to complete payment of {amount} {payment_type}.\n"
                        f"Please fund your agent wallet ({self.wallet.get_public_key()}) and try again.\n"
                        f"Wallet address: {self.wallet.get_public_key()}"
                    )
                except (json.JSONDecodeError, KeyError, AttributeError):
                    raise ValueError(
                        f"Payment failed. Received 402 Payment Required but unable to process payment.\n"
                        f"Please fund your agent wallet ({self.wallet.get_public_key()}) and try again.\n"
                        f"Wallet address: {self.wallet.get_public_key()}"
                    )
            
            if response.status_code in [200, 202]:
                print("✅ Task created successfully!")
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
                    return self.poll_task_status(task_id)
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

    def integrated_analysis(
        self,
        text: str,
        ai_analysis_callback: callable,
        confidence_threshold: float = 0.99,
        agentName: str = "SentimentAI-Pro",
        reward: str = "0.3 USDC",
        rewardAmount: float = 0.3,
        category: str = "Analysis",
        escrowAmount: str = "0.6 USDC",
        context_type: str = "sentiment_check"
    ) -> dict:
        """
        Perform integrated analysis: AI first, then Human RPC if confidence is low.
        
        This method replicates the behavior of integrated_agent.py but uses the SDK's
        automatic payment handling. It runs AI analysis first, checks confidence,
        and automatically calls Human RPC if confidence is below the threshold.
        
        Args:
            text: The text/query to analyze
            ai_analysis_callback: Function that takes text and returns dict with:
                - userQuery: str
                - agentConclusion: str
                - confidence: float (0.0-1.0)
                - reasoning: str
            confidence_threshold: Confidence threshold to trigger Human RPC (default: 0.99)
            agentName: Name of the agent
            reward: Reward amount as string (e.g., "0.3 USDC")
            rewardAmount: Reward amount as float
            category: Category of the task (e.g., "Analysis", "Trading")
            escrowAmount: Escrow amount as string (e.g., "0.6 USDC")
            context_type: Type of context for Human RPC (default: "sentiment_check")
            
        Returns:
            Dictionary with analysis result (from AI or Human RPC)
            
        Example:
            from human_rpc_sdk import AutoAgent
            
            agent = AutoAgent()
            
            def analyze_text(text: str) -> dict:
                # Your AI analysis logic here
                return {
                    "userQuery": text,
                    "agentConclusion": "POSITIVE",
                    "confidence": 0.75,
                    "reasoning": "Analysis reasoning..."
                }
            
            result = agent.integrated_analysis(
                text="Wow, great job team. Another delay. Bullish!",
                ai_analysis_callback=analyze_text,
                confidence_threshold=0.99
            )
        """
        print("=" * 60)
        print("🤖 Step 1: Initial AI Analysis")
        print("=" * 60)
        print()
        
        # Step 1: Run initial AI analysis
        try:
            ai_result = ai_analysis_callback(text)
            
            # Validate AI result structure
            required_fields = ["userQuery", "agentConclusion", "confidence", "reasoning"]
            missing_fields = [field for field in required_fields if field not in ai_result]
            
            if missing_fields:
                raise ValueError(
                    f"AI analysis callback must return dict with fields: {', '.join(required_fields)}. "
                    f"Missing: {', '.join(missing_fields)}"
                )
            
            print(f"✅ AI Analysis Result:")
            print(f"   User Query: {ai_result['userQuery']}")
            print(f"   Agent Conclusion: {ai_result['agentConclusion']}")
            print(f"   Confidence: {ai_result['confidence']:.3f}")
            print(f"   Reasoning: {ai_result['reasoning']}")
            print()
            
            # Step 2: Check confidence threshold
            confidence = float(ai_result['confidence'])
            
            if confidence < confidence_threshold:
                print("=" * 60)
                print(f"⚠️  Low confidence detected ({confidence:.3f} < {confidence_threshold})")
                print("🔄 Triggering Human Payment (Human RPC)...")
                print("=" * 60)
                print()
                
                # Step 3: Call Human RPC with full task metadata
                try:
                    # Prepare context with new structure (all 4 required fields)
                    context = {
                        "type": context_type,
                        "summary": f"Validate sentiment classification. AI confidence: {confidence:.3f}",
                        "data": {
                            "userQuery": ai_result["userQuery"],
                            "agentConclusion": ai_result["agentConclusion"],
                            "confidence": confidence,
                            "reasoning": ai_result["reasoning"]
                        }
                    }
                    
                    print("📋 Context prepared for Human RPC:")
                    print(f"   User Query: {context['data']['userQuery']}")
                    print(f"   Agent Conclusion: {context['data']['agentConclusion']}")
                    print(f"   Confidence: {context['data']['confidence']:.3f}")
                    print(f"   Reasoning: {context['data']['reasoning'][:100]}...")
                    print()
                    
                    # Call Human RPC using SDK (automatic payment handling)
                    human_result = self.ask_human_rpc(
                        text=ai_result["userQuery"],
                        agentName=agentName,
                        reward=reward,
                        rewardAmount=rewardAmount,
                        category=category,
                        escrowAmount=escrowAmount,
                        context=context
                    )
                    
                    print()
                    print("=" * 60)
                    print("✅ Human RPC Analysis Complete")
                    print("=" * 60)
                    print()
                    print("Final Result (from Human RPC):")
                    print(json.dumps(human_result, indent=2))
                    print()
                    
                    # Return human result (should have same structure)
                    return human_result
                    
                except Exception as e:
                    print()
                    print("=" * 60)
                    print(f"❌ Human RPC failed: {e}")
                    print("📊 Falling back to AI result...")
                    print("=" * 60)
                    print()
                    return ai_result
            else:
                print("=" * 60)
                print(f"✅ High confidence ({confidence:.3f} >= {confidence_threshold})")
                print("📊 Using AI result (no Human RPC needed)")
                print("=" * 60)
                print()
                return ai_result
                
        except Exception as e:
            print(f"❌ Error during AI analysis: {e}")
            raise

