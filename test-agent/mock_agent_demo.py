#!/usr/bin/env python3
"""
Mock Agent Demo - Tests the @guard decorator with a mock human verification.
This demonstrates the SDK functionality without requiring a live HumanRPC server.
"""

import json
import os
import sys
from dotenv import load_dotenv

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import guard, HumanVerificationError

# Load environment variables
load_dotenv()

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.85

@guard(
    threshold=CONFIDENCE_THRESHOLD,
    agent_id="MockSentimentBot",
    reward="0.3 USDC",
    reward_amount=0.3,
    category="Sentiment Analysis",
    escrow_amount="0.6 USDC",
    timeout=30,  # Short timeout for demo
    fallback_on_error=True  # Return original result if human verification fails
)
def analyze_sentiment_mock(text: str) -> dict:
    """
    Mock sentiment analysis that returns low confidence for ambiguous text.
    
    Args:
        text: The text to analyze
        
    Returns:
        Dictionary with sentiment analysis results
    """
    # Simple mock logic that creates uncertainty for neutral/ambiguous text
    text_lower = text.lower()
    
    # Clearly positive phrases
    if any(word in text_lower for word in ["amazing", "excellent", "fantastic", "love"]):
        return {
            "userQuery": text,
            "agentConclusion": "POSITIVE",
            "confidence": 0.95,
            "reasoning": "Contains clearly positive language"
        }
    
    # Clearly negative phrases
    elif any(word in text_lower for word in ["terrible", "awful", "hate", "worst"]):
        return {
            "userQuery": text,
            "agentConclusion": "NEGATIVE", 
            "confidence": 0.92,
            "reasoning": "Contains clearly negative language"
        }
    
    # Ambiguous/neutral phrases - low confidence
    else:
        return {
            "userQuery": text,
            "agentConclusion": "NEUTRAL",
            "confidence": 0.65,  # Below threshold - will trigger human verification
            "reasoning": "Text is ambiguous and could be interpreted multiple ways"
        }


def main():
    """Main function to demonstrate the mock agent."""
    print("=" * 60)
    print("Mock Agent Demo - Sentiment Analysis with @guard")
    print("=" * 60)
    print()
    print("This demo shows how the @guard decorator works:")
    print(f"- Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print("- High confidence: Returns result immediately")
    print("- Low confidence: Attempts human verification (will fail in demo)")
    print()
    
    # Test cases with different confidence levels
    test_cases = [
        "This product is absolutely amazing!",  # High confidence - POSITIVE
        "This is terrible and awful",           # High confidence - NEGATIVE  
        "It's okay I guess",                    # Low confidence - will try human verification
    ]
    
    for i, test_text in enumerate(test_cases, 1):
        print(f"Test {i}: Analyzing \"{test_text}\"")
        print("-" * 50)
        
        try:
            result = analyze_sentiment_mock(test_text)
            
            print("Result:")
            print(json.dumps(result, indent=2))
            
            # Check if human verification was attempted
            if "human_verification_error" in result:
                print("📝 Note: Human verification was attempted but failed (expected in demo)")
                print(f"   Error: {result['human_verification_error']}")
            elif "human_verdict" in result:
                print("✅ Human verification completed successfully!")
            else:
                print("🤖 AI analysis was confident enough - no human verification needed")
                
        except Exception as e:
            print(f"❌ Error: {e}")
        
        print()


if __name__ == "__main__":
    # Check if we have a private key (needed for wallet initialization)
    if not os.getenv("SOLANA_PRIVATE_KEY"):
        print("⚠️  SOLANA_PRIVATE_KEY not set - human verification will fail")
        print("   This is expected for the demo. The agent will fall back to original results.")
        print()
    
    main()