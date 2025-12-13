#!/usr/bin/env python3
"""
Mock Agent Demo - Demonstrates HumanRPC SDK integration without external APIs.
This version uses mock AI analysis to show the @guard decorator functionality.
"""

import json
import os
import sys
import random
from dotenv import load_dotenv

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent, guard, HumanVerificationError, SDKConfigurationError, PaymentError

# Load environment variables
load_dotenv()

# Initialize HumanRPC SDK with custom configuration for this agent
agent = AutoAgent(
    network="devnet",  # Use devnet for testing
    timeout=30,
    default_agent_name="SarcasmDetector-v1",
    default_reward="0.4 USDC",
    default_reward_amount=0.4,
    default_category="Sarcasm Detection",
    default_escrow_amount="0.8 USDC"
)

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.8  # Lower threshold to trigger human verification more often


@guard(
    threshold=CONFIDENCE_THRESHOLD,
    agent_id="SarcasmDetector-v1",
    reward="0.4 USDC",
    reward_amount=0.4,
    category="Sarcasm Detection",
    escrow_amount="0.8 USDC",
    timeout=300,
    fallback_on_error=True
)
def analyze_text_mock(text: str) -> dict:
    """
    Mock AI analysis for sentiment with varying confidence levels.
    
    This simulates an AI that sometimes has low confidence, triggering
    the @guard decorator to request human verification.
    
    Args:
        text: The text to analyze
        
    Returns:
        Dictionary with required fields for @guard decorator
    """
    
    # Mock AI analysis with different confidence levels based on text content
    if "great job" in text.lower() and "delay" in text.lower():
        # This is sarcastic - AI should be uncertain
        sentiment = "POSITIVE"  # AI gets it wrong
        confidence = 0.6  # Low confidence - will trigger human verification
        reasoning = "Detected positive words 'great job' but uncertain due to context with 'delay'"
    elif "amazing" in text.lower():
        # Clear positive sentiment
        sentiment = "POSITIVE"
        confidence = 0.95  # High confidence
        reasoning = "Strong positive sentiment with word 'amazing'"
    elif "terrible" in text.lower():
        # Clear negative sentiment
        sentiment = "NEGATIVE"
        confidence = 0.92  # High confidence
        reasoning = "Strong negative sentiment with word 'terrible'"
    else:
        # Uncertain cases
        sentiment = random.choice(["POSITIVE", "NEGATIVE", "NEUTRAL"])
        confidence = random.uniform(0.5, 0.75)  # Low confidence range
        reasoning = f"Uncertain analysis, classified as {sentiment} with low confidence"
    
    return {
        "userQuery": text,
        "agentConclusion": sentiment,
        "confidence": confidence,
        "reasoning": reasoning
    }


def main():
    """Main function to demonstrate the SDK integration."""
    print("=" * 60)
    print("Mock Agent Demo - HumanRPC SDK Integration")
    print("=" * 60)
    print()
    print("This demo shows how the @guard decorator works:")
    print(f"- Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print("- When AI confidence < threshold → Human verification requested")
    print("- When AI confidence ≥ threshold → AI result returned directly")
    print()
    
    # Test cases with different confidence levels
    test_cases = [
        "Wow, great job team. Another delay. Bullish!",  # Should trigger human verification (sarcastic)
        "This product is absolutely amazing!",           # High confidence, no human verification
        "Terrible experience, would not recommend",      # High confidence, no human verification
        "It's okay I guess, not sure how I feel"        # Low confidence, may trigger human verification
    ]
    
    for i, test_text in enumerate(test_cases, 1):
        print(f"📝 Test {i}: Analyzing \"{test_text}\"")
        print("-" * 50)
        
        try:
            result = analyze_text_mock(test_text)
            
            # Display results
            print(f"🤖 AI Conclusion: {result.get('agentConclusion', 'UNKNOWN')}")
            print(f"📊 Confidence: {result.get('confidence', 0):.3f}")
            print(f"💭 Reasoning: {result.get('reasoning', 'No reasoning')}")
            
            # Check if human verification was triggered
            if "human_verdict" in result:
                print("🤖➡️👤 Human verification was requested!")
                human_verdict = result["human_verdict"]
                print(f"👤 Human decision: {human_verdict.get('decision', 'unknown')}")
                print(f"💰 Payment processed: 0.4 USDC reward")
            else:
                print("🤖 AI was confident enough - no human verification needed")
            
            print()
            
        except SDKConfigurationError as e:
            print(f"❌ SDK Configuration Error: {e}")
            break
        except PaymentError as e:
            print(f"❌ Payment Error: {e}")
            print(f"   Wallet: {agent.wallet.get_public_key()}")
            break
        except HumanVerificationError as e:
            print(f"❌ Human verification failed: {e}")
            print("   (This is expected if HumanRPC server is not running)")
        except Exception as e:
            print(f"❌ Unexpected error: {e}")
            import traceback
            traceback.print_exc()
        
        print()


if __name__ == "__main__":
    # Verify required environment variables
    if not os.getenv("SOLANA_PRIVATE_KEY"):
        print("❌ Missing SOLANA_PRIVATE_KEY environment variable")
        print("Please set it in your .env file")
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