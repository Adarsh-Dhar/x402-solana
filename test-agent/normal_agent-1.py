#!/usr/bin/env python3
"""
Normal Agent (Baseline) - Uses LLM to analyze text for sarcasm and slang.
This baseline agent often fails on sarcasm detection.
Now integrated with HumanRPC SDK for automatic Human RPC when confidence is low.
"""

import json
import os
import sys
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent, guard, HumanVerificationError, SDKConfigurationError, PaymentError

# Load environment variables
load_dotenv()

# Initialize HumanRPC SDK with custom configuration for this agent
# The SDK auto-manages wallet creation and handles 402 Payment Required responses
agent = AutoAgent(
    network="devnet",  # Use devnet for testing, change to "mainnet-beta" for production
    timeout=30,  # Longer timeout for LLM processing
    default_agent_name="SarcasmDetector-v1",  # Custom agent name
    default_reward="0.4 USDC",  # Higher reward for sarcasm detection (complex task)
    default_reward_amount=0.4,  # Matching float value
    default_category="Sarcasm Detection",  # Specific category for this task
    default_escrow_amount="0.8 USDC"  # 2x reward as escrow (best practice)
)

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.99


@guard(
    threshold=CONFIDENCE_THRESHOLD,  # Use the confidence threshold
    agent_id="SarcasmDetector-v1",  # Agent identifier
    reward="0.4 USDC",  # Reward for human verification
    reward_amount=0.4,  # Reward amount as float
    category="Sarcasm Detection",  # Task category
    escrow_amount="0.8 USDC",  # Escrow amount (2x reward)
    timeout=300,  # 5 minutes timeout for human response
    fallback_on_error=True  # Return original result if human verification fails
)
def analyze_text(text: str) -> dict:
    """
    Analyze text for sentiment using LLM with automatic human verification.
    
    This function is decorated with @guard which automatically:
    - Runs the AI analysis
    - Checks confidence against threshold (0.99)
    - Calls Human RPC if confidence is low
    - Handles Solana payments automatically
    - Returns combined AI + human result
    
    Args:
        text: The text/query to analyze (user query)
        
    Returns:
        Dictionary with required fields:
        - userQuery: The original query/text
        - agentConclusion: What the agent thinks (e.g., "POSITIVE" or "NEGATIVE")
        - confidence: Confidence level (0.0-1.0)
        - reasoning: Why the agent thinks that (explanation of the analysis)
        - human_verdict: (optional) Human verification result if confidence was low
    """
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

Return ONLY valid JSON in this exact format:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.0-1.0,
  "reasoning": "A brief explanation of why you reached this conclusion, including any indicators of sarcasm, irony, or slang that influenced your decision"
}"""
    
    # Build a single prompt string using system prompt + user message
    prompt = f"{system_prompt}\n\nUSER: Analyze this text: {text}"
    
    # Initialize the model (can be overridden with GEMINI_MODEL env var)
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


def main():
    """Main function to run the normal agent with integrated Human RPC support."""
    print("=" * 60)
    print("Normal Agent (Baseline) - Sarcasm & Slang Detector")
    print("Integrated with HumanRPC SDK for automatic Human RPC")
    print("=" * 60)
    print()
    print("This agent uses AI for initial analysis, then calls Human RPC")
    print(f"when confidence is below the threshold ({CONFIDENCE_THRESHOLD}).")
    print("The @guard decorator automatically handles the confidence check and Human RPC calls.")
    print()
    
    # Hardcoded test input that should trick the AI
    test_text = "Wow, great job team. Another delay. Bullish!"
    
    print(f"📝 Analyzing text: \"{test_text}\"")
    print()
    
    try:
        # The @guard decorator on analyze_text will:
        # 1. Run the AI analysis first
        # 2. Check confidence against threshold
        # 3. Automatically call Human RPC if confidence is low
        # 4. Handle automatic payment (SOL or USDC)
        # 5. Return combined result with human verdict if needed
        result = analyze_text(test_text)
        
        print()
        print("=" * 60)
        print("📋 Final Analysis Summary")
        print("=" * 60)
        print(json.dumps(result, indent=2))
        print()
        
        # Check if human verification was triggered
        has_human_verdict = "human_verdict" in result
        conclusion = result.get("agentConclusion", "UNKNOWN")
        confidence = result.get("confidence", 1.0)
        
        # Highlight if it got it wrong (this is sarcastic, should be NEGATIVE)
        if conclusion == "POSITIVE":
            print("⚠️  WARNING: This text is sarcastic and should be NEGATIVE!")
            if has_human_verdict:
                print("   🤖➡️👤 Human RPC was called due to low AI confidence.")
                human_decision = result.get("human_verdict", {}).get("decision", "unknown")
                print(f"   👤 Human verdict: {human_decision}")
            else:
                print("   🤖 AI had high confidence but still got it wrong.")
        else:
            print("✅ Correctly identified as NEGATIVE (sarcastic).")
            if has_human_verdict:
                print("   🤖➡️👤 Human verification confirmed the AI's analysis.")
            else:
                print("   🤖 AI analysis was confident and correct.")
        
        # Show payment information if human verification occurred
        if has_human_verdict:
            print()
            print("💰 Payment Information:")
            print(f"   Reward: 0.4 USDC")
            print(f"   Escrow: 0.8 USDC")
            print(f"   Network: devnet")
            print(f"   Agent: SarcasmDetector-v1")
            
    except SDKConfigurationError as e:
        print(f"❌ SDK Configuration Error: {e}")
        print("   Check your SOLANA_PRIVATE_KEY and other configuration.")
    except PaymentError as e:
        print(f"❌ Payment Error: {e}")
        print("   This could be due to insufficient funds in your Solana wallet.")
        print(f"   Wallet address: {agent.wallet.get_public_key()}")
    except HumanVerificationError as e:
        print(f"❌ Human verification failed: {e}")
        print("   This could be due to network issues or Human RPC API problems.")
    except Exception as e:
        print(f"❌ Unexpected error during analysis: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY", "GOOGLE_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print()
        print("Please set these environment variables:")
        print("   export SOLANA_PRIVATE_KEY='your_base58_private_key'")
        print("   export GOOGLE_API_KEY='your_google_api_key'")
        print()
        print("For SOLANA_PRIVATE_KEY, you can generate a devnet wallet at:")
        print("   https://solfaucet.com/")
        sys.exit(1)
    
    # Show configuration
    print("🔧 Agent Configuration:")
    print(f"   Network: {agent.network}")
    print(f"   Agent Name: {agent.default_agent_name}")
    print(f"   Reward: {agent.default_reward}")
    print(f"   Category: {agent.default_category}")
    print(f"   Escrow: {agent.default_escrow_amount}")
    print(f"   Confidence Threshold: {CONFIDENCE_THRESHOLD}")
    print(f"   Wallet: {agent.wallet.get_public_key()}")
    print()
    
    main()

