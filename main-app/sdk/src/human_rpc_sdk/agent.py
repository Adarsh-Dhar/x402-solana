"""
AutoAgent HTTP client with automatic 402 payment handling.

Provides an HTTP client that automatically intercepts 402 Payment Required
responses, builds and signs Solana transactions, and retries requests with
payment headers to unlock protected content.
"""

import os
import json
import base64
import time
import requests
import signal
import atexit
from typing import Optional, Dict, Any
from .wallet import WalletManager
from .invoices import Invoice, parse_invoice_from_response
from .solana_utils import build_payment_transaction, create_payment_header
from .exceptions import SDKConfigurationError, PaymentError, HumanVerificationError
from .reiterator import ReiteratorManager


class AutoAgent:
    """
    Autonomous Payment Agent for x402 protocol.
    
    Automatically intercepts 402 Payment Required responses and handles
    Solana payments (SOL or USDC) to unlock paywalled content.
    """
    
    def __init__(
        self,
        solana_private_key: Optional[str] = None,
        rpc_url: Optional[str] = None,
        human_rpc_url: Optional[str] = None,
        network: str = "devnet",
        timeout: int = 10,
        default_agent_name: str = "SentimentAI-Pro",
        default_reward: str = "0.3 USDC",
        default_reward_amount: float = 0.3,
        default_category: str = "Analysis",
        default_escrow_amount: str = "0.6 USDC",
        enable_session_management: bool = True,
        heartbeat_interval: int = 60,  # seconds
        reiterator: bool = False,
        max_retry_attempts: int = 3,
        backoff_strategy: str = "exponential",
        base_delay: float = 1.0
    ):
        """
        Initialize the AutoAgent.
        
        Args:
            solana_private_key: Base58-encoded Solana private key (uses env var if None)
            rpc_url: Solana RPC URL (uses env var or default if None)
            human_rpc_url: Human RPC endpoint URL (uses env var or default if None)
            network: Solana network ("devnet" or "mainnet-beta")
            timeout: Default timeout for HTTP requests
            default_agent_name: Default agent name for human verification requests
            default_reward: Default reward amount as string (e.g., "0.3 USDC")
            default_reward_amount: Default reward amount as float
            default_category: Default category for human verification tasks
            default_escrow_amount: Default escrow amount as string (e.g., "0.6 USDC")
            enable_session_management: Enable automatic session management and heartbeats
            heartbeat_interval: Interval in seconds between heartbeat updates
            reiterator: Enable automatic retry on negative consensus
            max_retry_attempts: Maximum number of retry attempts for reiterator
            backoff_strategy: Backoff strategy for reiterator ("exponential", "linear", "fixed")
            base_delay: Base delay in seconds for reiterator backoff
            
        Raises:
            SDKConfigurationError: If configuration is invalid
        """
        self.network = network
        # Validate and set timeout (use default if invalid)
        self.timeout = timeout if timeout > 0 else 10
        
        # Store user-configurable defaults
        self.default_agent_name = default_agent_name
        self.default_reward = default_reward
        self.default_reward_amount = default_reward_amount
        self.default_category = default_category
        self.default_escrow_amount = default_escrow_amount
        
        # Initialize wallet manager
        try:
            self.wallet = WalletManager(solana_private_key)
        except Exception as e:
            raise SDKConfigurationError(f"Failed to initialize wallet: {e}")
        
        # Set up RPC URL
        if rpc_url:
            os.environ["SOLANA_RPC_URL"] = rpc_url
        
        # Set up Human RPC URL
        self.human_rpc_url = (
            human_rpc_url or 
            os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
        )
        
        # Session management
        self.enable_session_management = enable_session_management
        self.heartbeat_interval = heartbeat_interval
        self.session_id = None
        self.last_heartbeat = None
        self._heartbeat_thread = None
        self._shutdown_event = None
        
        # Initialize HTTP session
        self.session = requests.Session()
        self.session.timeout = timeout
        
        # Initialize reiterator if enabled
        self.reiterator_enabled = reiterator
        self.reiterator = None
        if reiterator:
            try:
                self.reiterator = ReiteratorManager(
                    max_attempts=max_retry_attempts,
                    backoff_strategy=backoff_strategy,
                    base_delay=base_delay
                )
            except Exception as e:
                raise SDKConfigurationError(f"Failed to initialize reiterator: {e}")
        
        # Start session management if enabled
        if self.enable_session_management:
            self._start_session_management()
            self._setup_signal_handlers()
    
    def get(self, url: str, headers: Optional[Dict[str, str]] = None, **kwargs) -> requests.Response:
        """
        Make a GET request with automatic 402 payment handling.
        
        Args:
            url: Request URL
            headers: Optional HTTP headers
            **kwargs: Additional arguments passed to requests
            
        Returns:
            Response object from requests library
        """
        return self.request("GET", url, headers=headers, **kwargs)
    
    def post(
        self, 
        url: str, 
        json: Optional[Dict[str, Any]] = None,
        data: Optional[Any] = None,
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> requests.Response:
        """
        Make a POST request with automatic 402 payment handling.
        
        Args:
            url: Request URL
            json: JSON data to send
            data: Form data to send
            headers: Optional HTTP headers
            **kwargs: Additional arguments passed to requests
            
        Returns:
            Response object from requests library
        """
        return self.request("POST", url, json=json, data=data, headers=headers, **kwargs)
    
    def request(
        self, 
        method: str, 
        url: str, 
        headers: Optional[Dict[str, str]] = None,
        **kwargs
    ) -> requests.Response:
        """
        Make an HTTP request with automatic 402 payment handling.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            headers: Optional HTTP headers
            **kwargs: Additional arguments passed to requests
            
        Returns:
            Response object from requests library
            
        Raises:
            PaymentError: If payment processing fails
        """
        # Ensure headers is a dict
        if headers is None:
            headers = {}
        
        # Set default timeout if not provided
        if "timeout" not in kwargs:
            kwargs["timeout"] = self.timeout
        
        # Make initial request
        response = self.session.request(method, url, headers=headers, **kwargs)
        
        # Handle 402 Payment Required
        if response.status_code == 402:
            print("[*] Paywall detected. Processing payment...")
            
            try:
                # Parse invoice from response
                invoice = parse_invoice_from_response(response.text)
                
                # Log payment details
                currency = invoice.get_currency()
                amount = invoice.get_amount_lamports()
                recipient = invoice.get_recipient()
                
                if currency == "SOL":
                    amount_display = f"{amount / 1_000_000_000:.6f} SOL"
                else:
                    amount_display = f"{amount / 1_000_000:.6f} {currency}"
                
                print(f"[*] Payment required: {amount_display} to {recipient}")
                
                # Build and sign payment transaction
                serialized_tx = build_payment_transaction(
                    sender_keypair=self.wallet.get_signer(),
                    recipient=recipient,
                    amount=amount,
                    currency=currency,
                    mint=invoice.get_mint(),
                    network=invoice.get_network()
                )
                
                # Create payment header
                payment_payload = create_payment_header(serialized_tx, invoice.get_network())
                payment_header = base64.b64encode(
                    json.dumps(payment_payload).encode()
                ).decode()
                
                # Add payment header and retry request
                headers["X-PAYMENT"] = payment_header
                
                print(f"[*] {currency} payment sent. Retrying request...")
                retry_response = self.session.request(method, url, headers=headers, **kwargs)
                
                # Check if payment was accepted
                if retry_response.status_code == 402:
                    raise PaymentError(
                        f"Payment verification failed. Transaction sent but not accepted.\n"
                        f"Wallet: {self.wallet.get_public_key()}\n"
                        f"Required: {amount_display}"
                    )
                
                return retry_response
                
            except Exception as e:
                if isinstance(e, PaymentError):
                    raise
                
                # Wrap other exceptions in PaymentError
                raise PaymentError(
                    f"Payment processing failed: {e}\n"
                    f"Please ensure wallet {self.wallet.get_public_key()} has sufficient funds."
                )
        
        return response
    
    def ask_human_rpc(
        self,
        text: str,
        agentName: Optional[str] = None,
        reward: Optional[str] = None,
        rewardAmount: Optional[float] = None,
        category: Optional[str] = None,
        escrowAmount: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Request human analysis through the HumanRPC API.
        
        Automatically handles 402 payments and polls for task completion.
        
        Args:
            text: Text to analyze
            agentName: Name of the requesting agent (uses default if None)
            reward: Reward amount as string (uses default if None)
            rewardAmount: Reward amount as float (uses default if None)
            category: Task category (uses default if None)
            escrowAmount: Escrow amount as string (uses default if None)
            context: Context dictionary with task metadata
            
        Returns:
            Human analysis result
            
        Raises:
            HumanVerificationError: If human verification fails
        """
        # Use defaults if parameters not provided
        agentName = agentName or self.default_agent_name
        reward = reward or self.default_reward
        rewardAmount = rewardAmount if rewardAmount is not None else self.default_reward_amount
        category = category or self.default_category
        escrowAmount = escrowAmount or self.default_escrow_amount
        
        print(f"🌐 Calling Human RPC API: {self.human_rpc_url}")
        print(f"📝 Text to analyze: \"{text}\"")
        print(f"🤖 Agent: {agentName}")
        print(f"💰 Reward: {reward}")
        
        # Validate context if provided
        if context:
            self._validate_context(context)
        else:
            raise HumanVerificationError(
                "Context is required. Must include userQuery, agentConclusion, confidence, and reasoning."
            )
        
        # Prepare request payload
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
        
        headers = {"Content-Type": "application/json"}
        
        # Define the task execution function for reiterator
        def execute_task():
            # Make request (automatically handles 402 payments)
            response = self.post(self.human_rpc_url, json=payload, headers=headers)
            
            if response.status_code in [200, 202]:
                print("✅ Task created successfully!")
                
                if not response.text or not response.text.strip():
                    raise HumanVerificationError("Empty response from Human RPC API")
                
                task_response = response.json()
                task_id = task_response.get("task_id")
                
                if not task_id:
                    raise HumanVerificationError("No task_id in response")
                
                print(f"📋 Task ID: {task_id}")
                
                # Poll for completion
                return self._poll_task_status(task_id)
            else:
                raise HumanVerificationError(
                    f"Unexpected response status: {response.status_code}. "
                    f"Response: {response.text[:500]}"
                )
        
        try:
            # Use reiterator if enabled, otherwise execute directly
            if self.reiterator_enabled and self.reiterator:
                print("[Reiterator] Executing task with automatic retry enabled")
                return self.reiterator.execute_with_retry(execute_task)
            else:
                return execute_task()
                
        except requests.RequestException as e:
            raise HumanVerificationError(f"HTTP request failed: {e}")
        except json.JSONDecodeError as e:
            raise HumanVerificationError(f"Failed to parse JSON response: {e}")
        except Exception as e:
            if isinstance(e, HumanVerificationError):
                raise
            raise HumanVerificationError(f"Unexpected error: {e}")
    
    def _start_session_management(self):
        """Start agent session management with heartbeats."""
        import threading
        
        try:
            # Create or update session
            self._create_or_update_session()
            
            # Start heartbeat thread
            self._shutdown_event = threading.Event()
            self._heartbeat_thread = threading.Thread(
                target=self._heartbeat_worker,
                daemon=True
            )
            self._heartbeat_thread.start()
            
            print(f"[Session] Started session management for {self.default_agent_name}")
            
        except Exception as e:
            print(f"[Session] Failed to start session management: {e}")
    
    def _create_or_update_session(self):
        """Create or update agent session."""
        try:
            session_url = self.human_rpc_url.replace("/tasks", "/agent-sessions")
            
            payload = {
                "agentName": self.default_agent_name,
                "walletAddress": str(self.wallet.get_public_key()),
                "metadata": {
                    "network": self.network,
                    "sdkVersion": "1.0.0",
                    "startedAt": time.time()
                }
            }
            
            response = self.session.post(session_url, json=payload, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.session_id = data.get("sessionId")
                self.last_heartbeat = time.time()
                print(f"[Session] {data.get('message', 'Session updated')}: {self.session_id}")
            else:
                print(f"[Session] Failed to create/update session: {response.status_code}")
                
        except Exception as e:
            print(f"[Session] Session management error: {e}")
    
    def _heartbeat_worker(self):
        """Background worker for sending heartbeats."""
        while not self._shutdown_event.is_set():
            try:
                # Wait for heartbeat interval or shutdown
                if self._shutdown_event.wait(self.heartbeat_interval):
                    break
                
                # Send heartbeat
                self._create_or_update_session()
                
            except Exception as e:
                print(f"[Session] Heartbeat error: {e}")
    
    def terminate_session(self):
        """Manually terminate the agent session."""
        try:
            if self._shutdown_event:
                self._shutdown_event.set()
            
            if self._heartbeat_thread and self._heartbeat_thread.is_alive():
                self._heartbeat_thread.join(timeout=5)
            
            if self.session_id:
                session_url = self.human_rpc_url.replace("/tasks", "/agent-sessions")
                params = {"sessionId": self.session_id}
                
                response = self.session.delete(session_url, params=params, timeout=10)
                
                if response.status_code == 200:
                    data = response.json()
                    print(f"[Session] Session terminated: {data.get('tasksAborted', 0)} tasks aborted")
                else:
                    print(f"[Session] Failed to terminate session: {response.status_code}")
            
            self.session_id = None
            
        except Exception as e:
            print(f"[Session] Error terminating session: {e}")
    
    def __enter__(self):
        """Context manager entry."""
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit - automatically terminate session."""
        if self.enable_session_management:
            self.terminate_session()
    
    def _setup_signal_handlers(self):
        """Set up signal handlers for graceful shutdown."""
        def signal_handler(signum, frame):
            print(f"\n🛑 Received signal {signum}. Cleaning up agent session...")
            self.terminate_session()
            print("✅ Agent session terminated. Exiting.")
            os._exit(0)
        
        # Register signal handlers
        signal.signal(signal.SIGINT, signal_handler)   # Ctrl+C
        signal.signal(signal.SIGTERM, signal_handler)  # Termination signal
        
        # Also register atexit handler as backup
        atexit.register(self._cleanup_on_exit)
    
    def _cleanup_on_exit(self):
        """Cleanup function called on exit."""
        if self.enable_session_management and self.session_id:
            try:
                self.terminate_session()
            except Exception:
                pass  # Ignore errors during cleanup
    
    def _validate_context(self, context: Dict[str, Any]) -> None:
        """Validate context structure for Human RPC requests."""
        if not isinstance(context, dict):
            raise HumanVerificationError("Context must be a dictionary")
        
        if "data" not in context:
            raise HumanVerificationError("Context must contain 'data' field")
        
        data = context["data"]
        if not isinstance(data, dict):
            raise HumanVerificationError("Context.data must be a dictionary")
        
        # Validate required fields
        required_fields = ["userQuery", "agentConclusion", "confidence", "reasoning"]
        missing_fields = [field for field in required_fields if field not in data]
        
        if missing_fields:
            raise HumanVerificationError(
                f"Context.data missing required fields: {', '.join(missing_fields)}"
            )
        
        # Validate field types
        if not isinstance(data["userQuery"], str) or not data["userQuery"].strip():
            raise HumanVerificationError("userQuery must be a non-empty string")
        
        if not isinstance(data["agentConclusion"], str) or not data["agentConclusion"].strip():
            raise HumanVerificationError("agentConclusion must be a non-empty string")
        
        confidence = data["confidence"]
        if not isinstance(confidence, (int, float)) or confidence < 0 or confidence > 1:
            raise HumanVerificationError("confidence must be a number between 0 and 1")
        
        if not isinstance(data["reasoning"], str) or not data["reasoning"].strip():
            raise HumanVerificationError("reasoning must be a non-empty string")
    
    def _poll_task_status(
        self, 
        task_id: str, 
        max_wait_seconds: Optional[int] = None,
        poll_interval: int = 3
    ) -> Dict[str, Any]:
        """
        Poll task status until completion.
        
        Args:
            task_id: Task ID to poll
            max_wait_seconds: Maximum wait time (None for indefinite)
            poll_interval: Seconds between polls
            
        Returns:
            Task completion result
            
        Raises:
            HumanVerificationError: If polling fails or times out
        """
        # Use query parameter approach as workaround for Next.js dynamic route issue
        task_url = f"{self.human_rpc_url}?taskId={task_id}"
        print("🔄 Waiting for human decision...")
        print(f"🔗 Polling URL: {task_url}")
        
        start_time = time.time()
        last_status_print = 0
        
        while True:
            elapsed = time.time() - start_time
            
            # Check timeout
            if max_wait_seconds is not None and elapsed >= max_wait_seconds:
                raise HumanVerificationError(
                    f"Polling timeout after {max_wait_seconds}s. Task {task_id} not completed."
                )
            
            try:
                response = self.get(task_url, timeout=10)
                
                if response.status_code == 404:
                    raise HumanVerificationError(f"Task {task_id} not found")
                
                # Treat 5xx as transient
                if 500 <= response.status_code < 600:
                    print(f"⚠️  Server error {response.status_code}, retrying...")
                    time.sleep(poll_interval)
                    continue
                
                if response.status_code != 200:
                    raise HumanVerificationError(
                        f"Failed to poll task. Status: {response.status_code}"
                    )
                
                task_data = response.json()
                status = task_data.get("status", "unknown")
                
                if status == "completed":
                    result = task_data.get("result", {})
                    if not result:
                        raise HumanVerificationError("Task completed but no result found")
                    
                    print("✅ Human decision received!")
                    
                    return {
                        "status": "Task Completed",
                        "task_id": task_id,
                        "sentiment": result.get("sentiment", "UNKNOWN"),
                        "confidence": result.get("confidence", 0.0),
                        "decision": result.get("decision", "unknown"),
                        "result": result,
                    }
                
                # Show progress
                if elapsed - last_status_print >= 10:
                    print(f"   Still waiting... ({int(elapsed)}s elapsed)")
                    last_status_print = elapsed
                
                time.sleep(poll_interval)
                
            except requests.RequestException as e:
                print(f"⚠️  Poll request failed: {e}")
                time.sleep(poll_interval)
            except json.JSONDecodeError as e:
                raise HumanVerificationError(f"Failed to parse task response: {e}")
    
    def enable_reiterator(self) -> None:
        """
        Enable reiterator functionality for automatic retry on negative consensus.
        
        If reiterator was not initialized during construction, creates a new
        ReiteratorManager with default settings.
        """
        if not self.reiterator:
            self.reiterator = ReiteratorManager()
        
        self.reiterator_enabled = True
        print("[Reiterator] Enabled automatic retry on negative consensus")
    
    def disable_reiterator(self) -> None:
        """
        Disable reiterator functionality.
        
        Stops retry attempts for subsequent tasks while preserving
        any ongoing iterations.
        """
        self.reiterator_enabled = False
        print("[Reiterator] Disabled automatic retry")
    
    def get_reiterator_status(self) -> Dict[str, Any]:
        """
        Get current reiterator status and configuration.
        
        Returns:
            Dictionary containing reiterator status information
        """
        if not self.reiterator:
            return {
                "enabled": False,
                "active": False,
                "message": "Reiterator not initialized"
            }
        
        status = self.reiterator.get_status()
        status["enabled"] = self.reiterator_enabled
        return status