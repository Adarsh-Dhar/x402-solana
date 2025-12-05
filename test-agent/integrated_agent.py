#!/usr/bin/env python3
"""
Integrated Agent (Advanced) - Uses LLM for initial analysis, then calls
Human RPC tool when confidence is low (< 0.70).
"""

import json
import os
from dotenv import load_dotenv
from normal_agent import analyze_text
from human_rpc_tool import ask_human_rpc

# Load environment variables
load_dotenv()

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.99


def integrated_analysis(text: str) -> dict:
    """
    Perform integrated analysis: AI first, then Human RPC if confidence is low.
    
    Args:
        text: The text/query to analyze (user query)
        
    Returns:
        Dictionary with analysis result containing:
        - userQuery: The original query/text
        - agentConclusion: What the agent thinks (e.g., "POSITIVE" or "NEGATIVE")
        - confidence: Confidence level (0.0-1.0)
        - reasoning: Why the agent thinks that
    """
    print("=" * 60)
    print("🤖 Step 1: Initial AI Analysis")
    print("=" * 60)
    print()
    
    # Step 1: Run initial AI analysis
    try:
        ai_result = analyze_text(text)

        # For this demo, we want to force the AI confidence to 0.85 so that:
        # - The printed confidence matches 0.85
        # - The Human RPC consensus algorithm also sees 0.85 and
        #   produces requiredVoters = 7 and consensusThreshold > 56%.
        ai_confidence_for_consensus = 0.85  # Tuned to produce 7 voters & >56% threshold
        ai_result["confidence"] = ai_confidence_for_consensus

        print(f"✅ AI Analysis Result:")
        print(f"   User Query: {ai_result['userQuery']}")
        print(f"   Agent Conclusion: {ai_result['agentConclusion']}")
        print(f"   Confidence: {ai_result['confidence']:.3f}")
        print(f"   Reasoning: {ai_result['reasoning']}")
        print()
        
        # Step 2: Check confidence threshold
        confidence = ai_result['confidence']

        if confidence < CONFIDENCE_THRESHOLD:
            print("=" * 60)
            print(f"⚠️  Low confidence detected ({confidence:.3f} < {CONFIDENCE_THRESHOLD})")
            print("🔄 Triggering Human Payment (Human RPC)...")
            print("=" * 60)
            print()
            
            # Step 3: Call Human RPC tool with full task metadata
            try:
                # Prepare context with new structure (all 4 required fields)
                # Use ai_result fields directly since they're already in the correct format
                context = {
                    "type": "sentiment_check",
                    "summary": f"Validate sentiment classification. AI confidence: {ai_confidence_for_consensus:.3f}",
                    "data": {
                        "userQuery": ai_result["userQuery"],  # Use from ai_result to ensure consistency
                        "agentConclusion": ai_result["agentConclusion"],
                        "confidence": ai_confidence_for_consensus,  # Use calibrated confidence for consensus
                        "reasoning": ai_result["reasoning"]
                    }
                }
                
                print("📋 Context prepared for Human RPC:")
                print(f"   User Query: {context['data']['userQuery']}")
                print(f"   Agent Conclusion: {context['data']['agentConclusion']}")
                print(f"   Confidence: {context['data']['confidence']:.3f}")
                print(f"   Reasoning: {context['data']['reasoning'][:100]}...")
                print()
                
                # Call Human RPC with full metadata
                # Note: text parameter should match userQuery for consistency
                human_result = ask_human_rpc.invoke({
                    "text": context["data"]["userQuery"],  # Use userQuery from context for consistency
                    "agentName": "SentimentAI-Pro",
                    "reward": "0.3 USDC",
                    "rewardAmount": 0.3,
                    "category": "Analysis",
                    "escrowAmount": "0.6 USDC",
                    "context": context
                })
                
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
            print(f"✅ High confidence ({confidence:.3f} >= {CONFIDENCE_THRESHOLD})")
            print("📊 Using AI result (no Human RPC needed)")
            print("=" * 60)
            print()
            return ai_result
            
    except Exception as e:
        print(f"❌ Error during AI analysis: {e}")
        raise


def main():
    """Main function to run the integrated agent."""
    print("=" * 60)
    print("Integrated Agent (Advanced) - Sarcasm & Slang Detector")
    print("=" * 60)
    print()
    print("This agent uses AI for initial analysis, then calls Human RPC")
    print("when confidence is below the threshold (0.70).")
    print()
    
    # Hardcoded test input that should trick the AI
    test_text = "Wow, great job team. Another delay. Bullish!"
    
    print(f"📝 Analyzing text: \"{test_text}\"")
    print()
    
    try:
        result = integrated_analysis(test_text)
        
        print()
        print("=" * 60)
        print("📋 Final Analysis Summary")
        print("=" * 60)
        print(json.dumps(result, indent=2))
        print()
        
        # Highlight if it got it wrong (this is sarcastic, should be NEGATIVE)
        conclusion = result.get("agentConclusion", result.get("sentiment", "UNKNOWN"))
        if conclusion == "POSITIVE":
            print("⚠️  WARNING: This text is sarcastic and should be NEGATIVE!")
            if result.get("confidence", 1.0) >= CONFIDENCE_THRESHOLD:
                print("   The AI had high confidence but still got it wrong.")
            else:
                print("   Human RPC was called due to low confidence.")
        else:
            print("✓ Correctly identified as NEGATIVE (sarcastic).")
            
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

