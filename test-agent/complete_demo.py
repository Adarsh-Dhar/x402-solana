#!/usr/bin/env python3
"""
Complete SDK Demo - Shows all SDK features without requiring external servers.
Demonstrates both high and low confidence scenarios with proper error handling.
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

def demo_high_confidence():
    """Demo with high confidence threshold - no human verification triggered."""
    print("=" * 60)
    print("DEMO 1: High Confidence Analysis (No Human Verification)")
    print("=" * 60)
    
    agent = AutoAgent(
        network="devnet",
        default_agent_name="HighConfidenceBot",
        default_reward="0.2 USDC",
        default_reward_amount=0.2,
        default_category="Simple Analysis"
    )
    
    @guard(
        threshold=0.95,  # Very high threshold
        agent_id="HighConfidenceBot",
        reward="0.2 USDC",
        reward_amount=0.2,
        fallback_on_error=True
    )
    def analyze_high_confidence(text: str) -> dict:
        """Analysis that returns high confidence."""
        return {
            "userQuery": text,
            "agentConclusion": "POSITIVE" if "amazing" in text.lower() else "NEGATIVE",
            "confidence": 0.98,  # Always high confidence
            "reasoning": "Clear sentiment indicators detected"
        }
    
    test_text = "This is absolutely amazing!"
    print(f"📝 Analyzing: \"{test_text}\"")
    print(f"🎯 Confidence threshold: 0.95")
    print()
    
    try:
        result = analyze_high_confidence(test_text)
        print("✅ Result:")
        print(f"   Conclusion: {result['agentConclusion']}")
        print(f"   Confidence: {result['confidence']:.2f}")
        print(f"   Status: AI confidence above threshold - no human verification needed")
        
        if "human_verification_error" in result:
            print("   ⚠️  Note: Human verification was attempted but not needed")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print()


def demo_low_confidence_with_fallback():
    """Demo with low confidence threshold - triggers human verification but falls back gracefully."""
    print("=" * 60)
    print("DEMO 2: Low Confidence Analysis (Human Verification Attempted)")
    print("=" * 60)
    
    agent = AutoAgent(
        network="devnet",
        default_agent_name="LowConfidenceBot",
        default_reward="0.4 USDC",
        default_reward_amount=0.4,
        default_category="Complex Analysis"
    )
    
    @guard(
        threshold=0.70,  # Low threshold to trigger human verification
        agent_id="LowConfidenceBot",
        reward="0.4 USDC",
        reward_amount=0.4,
        fallback_on_error=True  # Important: graceful fallback
    )
    def analyze_low_confidence(text: str) -> dict:
        """Analysis that returns low confidence to trigger human verification."""
        return {
            "userQuery": text,
            "agentConclusion": "NEUTRAL",
            "confidence": 0.55,  # Low confidence
            "reasoning": "Ambiguous text requires human verification"
        }
    
    test_text = "Interesting development."
    print(f"📝 Analyzing: \"{test_text}\"")
    print(f"🎯 Confidence threshold: 0.70")
    print(f"🤖 Expected AI confidence: 0.55 (below threshold)")
    print()
    
    try:
        result = analyze_low_confidence(test_text)
        print("📋 Result:")
        print(f"   AI Conclusion: {result['agentConclusion']}")
        print(f"   AI Confidence: {result['confidence']:.2f}")
        
        if "human_verdict" in result:
            print("   ✅ Human verification completed successfully!")
            human_result = result['human_verdict']
            print(f"   👤 Human decision: {human_result.get('decision', 'unknown')}")
        elif "human_verification_error" in result:
            print("   🤖➡️👤 Human verification was attempted")
            print("   ⚠️  Server not available - using AI result as fallback")
            print("   🔄 This is expected behavior when HumanRPC server is not running")
        else:
            print("   ❓ Unexpected: No human verification attempted")
        
        print(f"   📊 Final Status: Analysis completed with fallback handling")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print()


def demo_sdk_features():
    """Demo core SDK features without human verification."""
    print("=" * 60)
    print("DEMO 3: Core SDK Features")
    print("=" * 60)
    
    # Test AutoAgent initialization
    try:
        agent = AutoAgent(
            network="devnet",
            default_agent_name="FeatureDemo",
            default_reward="0.3 USDC",
            default_reward_amount=0.3,
            default_category="Feature Test"
        )
        
        print("✅ AutoAgent initialization successful")
        print(f"   Network: {agent.network}")
        print(f"   Agent Name: {agent.default_agent_name}")
        print(f"   Default Reward: {agent.default_reward}")
        print(f"   Wallet Address: {agent.wallet.get_public_key()}")
        
    except SDKConfigurationError as e:
        print(f"❌ SDK Configuration Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
    
    print()
    
    # Test @guard decorator without triggering human verification
    @guard(threshold=0.90, fallback_on_error=True)
    def simple_analysis(text: str) -> dict:
        return {
            "userQuery": text,
            "agentConclusion": "POSITIVE",
            "confidence": 0.95,
            "reasoning": "Simple positive analysis"
        }
    
    try:
        result = simple_analysis("Test input")
        print("✅ @guard decorator working correctly")
        print(f"   Result: {result['agentConclusion']} (confidence: {result['confidence']:.2f})")
        
    except Exception as e:
        print(f"❌ @guard decorator error: {e}")
    
    print()


def main():
    """Run all demos."""
    print("🚀 HumanRPC Python SDK - Complete Demo")
    print("=" * 60)
    print()
    print("This demo shows SDK functionality without requiring external servers.")
    print("It demonstrates:")
    print("  1. High confidence analysis (no human verification)")
    print("  2. Low confidence analysis (human verification with fallback)")
    print("  3. Core SDK features and error handling")
    print()
    
    # Check environment
    if not os.getenv("SOLANA_PRIVATE_KEY"):
        print("⚠️  SOLANA_PRIVATE_KEY not set")
        print("   Some wallet features will be limited, but demo will continue")
        print()
    
    # Run demos
    demo_high_confidence()
    demo_low_confidence_with_fallback()
    demo_sdk_features()
    
    print("=" * 60)
    print("✅ Demo completed successfully!")
    print()
    print("Key takeaways:")
    print("  • SDK initializes and configures correctly")
    print("  • @guard decorator works for both high and low confidence")
    print("  • Human verification attempts gracefully when server unavailable")
    print("  • Fallback behavior ensures robust operation")
    print("  • All SDK features demonstrated without external dependencies")


if __name__ == "__main__":
    main()