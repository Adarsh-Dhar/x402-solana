#!/usr/bin/env python3
"""
Session-Managed Agent - Demonstrates automatic session management and task cleanup.
This agent automatically manages its session and cleans up tasks when terminated.
"""

import json
import os
import sys
import time
import signal
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent, HumanVerificationError, SDKConfigurationError, PaymentError

# Load environment variables
load_dotenv()

def analyze_text_simple(text: str) -> dict:
    """Simple AI analysis for demonstration."""
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        raise ValueError("Google API key not configured. Set GOOGLE_API_KEY in your environment.")
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # Build system prompt
    system_prompt = """You are an expert at analyzing crypto-twitter slang and detecting sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.
Pay special attention to sarcasm, irony, and crypto-twitter slang terms.

IMPORTANT: Be conservative with confidence scores. If the text is ambiguous, unclear, or could be interpreted multiple ways, use a confidence score below 0.8. Only use high confidence (0.9+) for very clear, unambiguous sentiment.

Return ONLY valid JSON in this exact format:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.0-1.0,
  "reasoning": "A brief explanation of why you reached this conclusion, including any indicators of sarcasm, irony, or slang that influenced your decision"
}"""
    
    # Build a single prompt string using system prompt + user message
    prompt = f"{system_prompt}\n\nUSER: Analyze this text: {text}"
    
    # Initialize the model
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name)
    
    # Generate content
    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
            }
        )
        
        # Extract response text
        response_text = response.text if hasattr(response, 'text') else str(response)
        
        # Try to find JSON in the response
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            result = json.loads(json_str)
            
            # Validate result structure
            if 'sentiment' not in result or 'confidence' not in result or 'reasoning' not in result:
                raise ValueError(f"Invalid response structure: {result}")
            
            # Return new structure with all 4 required fields
            return {
                "userQuery": text,
                "agentConclusion": result['sentiment'],
                "confidence": float(result['confidence']),
                "reasoning": result['reasoning']
            }
        else:
            raise ValueError(f"Could not parse JSON from response: {response_text}")
            
    except Exception as e:
        print(f"⚠️  Error in Gemini API call: {e}")
        raise ValueError(f"Failed to analyze text: {e}")

def signal_handler(signum, frame):
    """Handle shutdown signals gracefully."""
    print(f"\n🛑 Received signal {signum}. Shutting down gracefully...")
    global agent
    if agent and hasattr(agent, 'terminate_session'):
        agent.terminate_session()
    sys.exit(0)

def main():
    """Main function demonstrating session-managed agent."""
    global agent
    
    print("=" * 60)
    print("Session-Managed Agent - Automatic Task Cleanup")
    print("=" * 60)
    print()
    print("This agent demonstrates automatic session management:")
    print("• Creates agent session on startup")
    print("• Sends heartbeats every 60 seconds")
    print("• Cleans up tasks when terminated")
    print("• Use Ctrl+C to test graceful shutdown")
    print()
    
    # Set up signal handlers for graceful shutdown
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    # Initialize agent with session management enabled
    agent = AutoAgent(
        network="devnet",
        timeout=30,
        default_agent_name="SessionManagedAgent-v1",
        default_reward="0.4 USDC",
        default_reward_amount=0.4,
        default_category="Session Demo",
        default_escrow_amount="0.8 USDC",
        enable_session_management=True,
        heartbeat_interval=60  # 1 minute heartbeats
    )
    
    print(f"🤖 Agent: {agent.default_agent_name}")
    print(f"💰 Wallet: {agent.wallet.get_public_key()}")
    print(f"📡 Session ID: {agent.session_id}")
    print()
    
    # Test scenarios
    test_texts = [
        "This is definitely not going to work out well.",
        "I'm absolutely thrilled about this amazing opportunity!",
        "Well, that's just fantastic...",  # Sarcastic
        "Not sure about this one.",  # Low confidence
    ]
    
    confidence_threshold = 0.75
    
    try:
        for i, test_text in enumerate(test_texts, 1):
            print(f"📝 Test {i}/4: \"{test_text}\"")
            
            # Run AI analysis
            ai_result = analyze_text_simple(test_text)
            confidence = ai_result.get("confidence", 1.0)
            conclusion = ai_result.get("agentConclusion", "UNKNOWN")
            
            print(f"🤖 AI Analysis: {conclusion} (confidence: {confidence:.3f})")
            
            # Check if Human RPC is needed
            if confidence < confidence_threshold:
                print(f"⚠️  Low confidence ({confidence:.3f} < {confidence_threshold}) - triggering Human RPC...")
                
                context = {
                    "type": "ai_verification",
                    "summary": f"Verify AI analysis from analyze_text. Confidence: {confidence:.3f}",
                    "data": {
                        "userQuery": ai_result["userQuery"],
                        "agentConclusion": ai_result["agentConclusion"],
                        "confidence": confidence,
                        "reasoning": ai_result["reasoning"]
                    }
                }
                
                try:
                    # This will create a task linked to our session
                    human_result = agent.ask_human_rpc(
                        text=ai_result["userQuery"],
                        context=context
                    )
                    
                    print(f"✅ Human decision: {human_result.get('decision', 'unknown')}")
                    
                except Exception as e:
                    print(f"❌ Human RPC error: {e}")
            else:
                print("✅ AI was confident enough - no human verification needed")
            
            print()
            
            # Wait between tests
            if i < len(test_texts):
                print("⏳ Waiting 10 seconds before next test...")
                time.sleep(10)
        
        print("🎉 All tests completed!")
        print()
        print("💡 The agent will continue running and sending heartbeats.")
        print("   Press Ctrl+C to test graceful shutdown and task cleanup.")
        print("   Or check the dashboard to see active tasks from this session.")
        print()
        
        # Keep agent alive to demonstrate session management
        try:
            while True:
                time.sleep(30)
                print(f"💓 Agent still alive - Session: {agent.session_id}")
        except KeyboardInterrupt:
            print("\n🛑 Keyboard interrupt received")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # Ensure session is terminated
        if agent and hasattr(agent, 'terminate_session'):
            print("🧹 Cleaning up session...")
            agent.terminate_session()
            print("✅ Session terminated")

if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY", "GOOGLE_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        sys.exit(1)
    
    agent = None
    main()