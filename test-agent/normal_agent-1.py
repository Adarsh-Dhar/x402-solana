#!/usr/bin/env python3
"""
Normal Agent (Baseline) - Uses LLM to analyze text for sarcasm and slang.
This baseline agent often fails on sarcasm detection.
Now integrated with x402 SDK for automatic Human RPC when confidence is low.
"""

import json
import os
import sys
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app'))
from sdk import AutoAgent

# Load environment variables
load_dotenv()

# Initialize x402 SDK for automatic payment handling and Human RPC integration
# The SDK auto-manages wallet creation and handles 402 Payment Required responses
agent = AutoAgent()

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.99


def analyze_text(text: str) -> dict:
    """
    Analyze text for sentiment using LLM.
    
    Args:
        text: The text/query to analyze (user query)
        
    Returns:
        Dictionary with all 4 required fields:
        - userQuery: The original query/text
        - agentConclusion: What the agent thinks (e.g., "POSITIVE" or "NEGATIVE")
        - confidence: Confidence level (0.0-1.0)
        - reasoning: Why the agent thinks that (explanation of the analysis)
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
    print("Integrated with x402 SDK for automatic Human RPC")
    print("=" * 60)
    print()
    print("This agent uses AI for initial analysis, then calls Human RPC")
    print(f"when confidence is below the threshold ({CONFIDENCE_THRESHOLD}).")
    print()
    
    # Hardcoded test input that should trick the AI
    test_text = "Wow, great job team. Another delay. Bullish!"
    
    print(f"📝 Analyzing text: \"{test_text}\"")
    print()
    
    try:
        # Use SDK's integrated_analysis method which handles:
        # 1. AI analysis first
        # 2. Confidence check
        # 3. Automatic Human RPC call if confidence is low
        # 4. Automatic payment handling (SOL or USDC)
        result = agent.integrated_analysis(
            text=test_text,
            ai_analysis_callback=analyze_text,
            confidence_threshold=CONFIDENCE_THRESHOLD
        )
        
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

