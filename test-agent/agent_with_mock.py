#!/usr/bin/env python3
"""
Agent with Mock Mode - Demonstrates low confidence triggering with mock human verification.
Falls back to mock responses when HumanRPC server is not available.
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

# Mock mode flag
MOCK_MODE = os.getenv("MOCK_HUMAN_RPC", "true").lower() == "true"

# Initialize HumanRPC SDK
agent = AutoAgent(
    network="devnet",
    timeout=30,
    default_agent_name="MockTestAgent",
    default_reward="0.4 USDC",
    default_reward_amount=0.4,
    default_category="Sarcasm Detection",
    default_escrow_amount="0.8 USDC"
)

# Low confidence threshold to trigger human verification
CONFIDENCE_THRESHOLD = 0.80

def mock_human_verification(text: str, ai_result: dict) -> dict:
    """Mock human verification that returns a simulated human response."""
    print("🎭 MOCK MODE: Simulating human verification...")
    print(f"   Human would analyze: \"{text}\"")
    print(f"   AI said: {ai_result.get('agentConclusion')} (confidence: {ai_result.get('confidence'):.2f})")
    
    # Simulate human decision (in real scenario, this would come from actual human)
    if "interesting development" in text.lower():
        human_decision = "NEUTRAL"
        human_confidence = 0.9
        human_reasoning = "Human: This phrase is genuinely neutral - could go either way depending on context"
    elif "okay i guess" in text.lower():
        human_decision = "NEGATIVE"
        human_confidence = 0.85
        human_reasoning = "Human: This shows reluctant acceptance, which is mildly negative"
    else:
        # Default: agree with AI but with human confidence
        human_decision = ai_result.get('agentConclusion', 'NEUTRAL')
        human_confidence = 0.88
        human_reasoning = f"Human: Confirmed AI analysis of {human_decision}"
    
    print(f"   👤 Human decision: {human_decision} (confidence: {human_confidence:.2f})")
    
    return {
        "status": "Task Completed",
        "task_id": "mock_task_123",
        "sentiment": human_decision,
        "confidence": human_confidence,
        "decision": human_decision,
        "result": {
            "sentiment": human_decision,
            "confidence": human_confidence,
            "reasoning": human_reasoning
        }
    }

@guard(
    threshold=CONFIDENCE_THRESHOLD,
    agent_id="MockTestAgent",
    reward="0.4 USDC",
    reward_amount=0.4,
    category="Sarcasm Detection",
    escrow_amount="0.8 USDC",
    timeout=30,
    fallback_on_error=True
)
def analyze_with_mock_human(text: str) -> dict:
    """Analyze text with mock human verification when confidence is low."""
    
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        # Return low confidence mock result to trigger human verification
        return {
            "userQuery": text,
            "agentConclusion": "NEUTRAL",
            "confidence": 0.60,  # Low confidence to trigger human verification
            "reasoning": "Mock analysis - no Google API key provided"
        }
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # System prompt that encourages lower confidence for ambiguous text
    system_prompt = """Analyze the sentiment of the given text as POSITIVE or NEGATIVE.
Be conservative with confidence - use confidence below 0.8 for ambiguous or unclear text.

Return ONLY valid JSON:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation"
}"""
    
    prompt = f"{system_prompt}\n\nAnalyze: {text}"
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt, generation_config={"temperature": 0.3})
        
        response_text = response.text if hasattr(response, 'text') else str(response)
        
        # Parse JSON
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            result = json.loads(json_str)
            
            return {
                "userQuery": text,
                "agentConclusion": result.get('sentiment', 'NEUTRAL'),
                "confidence": float(result.get('confidence', 0.5)),
                "reasoning": result.get('reasoning', 'AI analysis completed')
            }
        else:
            # Return low confidence to trigger human verification
            return {
                "userQuery": text,
                "agentConclusion": "NEUTRAL",
                "confidence": 0.65,
                "reasoning": "Could not parse AI response - ambiguous result"
            }
            
    except Exception as e:
        print(f"⚠️  Error in AI analysis: {e}")
        # Return low confidence to trigger human verification
        return {
            "userQuery": text,
            "agentConclusion": "NEUTRAL",
            "confidence": 0.50,
            "reasoning": f"Error in AI analysis: {e}"
        }


# Monkey patch the AutoAgent to use mock human verification in mock mode
if MOCK_MODE:
    original_ask_human_rpc = agent.ask_human_rpc
    
    def mock_ask_human_rpc(text, **kwargs):
        """Mock version that doesn't call real API."""
        context = kwargs.get('context', {})
        ai_data = context.get('data', {}) if context else {}
        
        # Simulate the human verification process
        return mock_human_verification(text, ai_data)
    
    agent.ask_human_rpc = mock_ask_human_rpc


def main():
    """Test the agent with mock human verification."""
    print("=" * 60)
    print("Agent with Mock Human Verification")
    print("=" * 60)
    print()
    print(f"Mock mode: {'ENABLED' if MOCK_MODE else 'DISABLED'}")
    print(f"Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print("Low confidence will trigger mock human verification")
    print()
    
    # Test cases designed to trigger different confidence levels
    test_cases = [
        "This is absolutely amazing!",      # Should be high confidence
        "Interesting development.",         # Should be low confidence
        "It's okay I guess.",              # Should be low confidence
    ]
    
    for i, text in enumerate(test_cases, 1):
        print(f"Test {i}: \"{text}\"")
        print("-" * 50)
        
        try:
            result = analyze_with_mock_human(text)
            
            print(f"🤖 AI Analysis: {result['agentConclusion']} (confidence: {result.get('confidence', 0):.2f})")
            
            # Check what happened
            if "human_verdict" in result:
                print("✅ Mock human verification completed!")
                human_result = result['human_verdict']
                print(f"   👤 Human decision: {human_result.get('decision', 'unknown')}")
                print(f"   🤝 Final result combines AI + Human input")
            elif "human_verification_error" in result:
                print("⚠️  Human verification failed (real server not available)")
                print("   🔄 Using AI result as fallback")
            else:
                print("✅ AI was confident enough - no human verification needed")
            
            print(f"📋 Final conclusion: {result['agentConclusion']}")
                
        except Exception as e:
            print(f"❌ Error: {e}")
        
        print()


if __name__ == "__main__":
    # Show configuration
    print("🔧 Agent Configuration:")
    print(f"   Network: {agent.network}")
    print(f"   Agent Name: {agent.default_agent_name}")
    print(f"   Reward: {agent.default_reward}")
    print(f"   Category: {agent.default_category}")
    print(f"   Mock Mode: {'ENABLED' if MOCK_MODE else 'DISABLED'}")
    print(f"   Confidence Threshold: {CONFIDENCE_THRESHOLD}")
    if hasattr(agent, 'wallet'):
        print(f"   Wallet: {agent.wallet.get_public_key()}")
    print()
    
    main()