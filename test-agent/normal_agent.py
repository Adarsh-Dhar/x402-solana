#!/usr/bin/env python3
"""
Normal Agent (Baseline) - Uses LLM to analyze text for sarcasm and slang.
This baseline agent often fails on sarcasm detection.
"""

import json
import os
from dotenv import load_dotenv
import google.generativeai as genai


# Load environment variables
load_dotenv()


def analyze_text(text: str) -> dict:
    """
    Analyze text for sentiment using LLM.
    Returns a dictionary with 'sentiment' and 'confidence' keys.
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
{"sentiment": "POSITIVE" or "NEGATIVE", "confidence": 0.0-1.0}"""
    
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
            if 'sentiment' not in result or 'confidence' not in result:
                raise ValueError(f"Invalid response structure: {result}")
            
            return {
                "sentiment": result['sentiment'],
                "confidence": float(result['confidence'])
            }
        else:
            raise ValueError(f"Could not parse JSON from response: {response_text}")
            
    except Exception as e:
        print(f"⚠️  Error in Gemini API call: {e}")
        raise ValueError(f"Failed to analyze text: {e}")


def main():
    """Main function to run the normal agent."""
    print("=" * 60)
    print("Normal Agent (Baseline) - Sarcasm & Slang Detector")
    print("=" * 60)
    print()
    
    # Hardcoded test input that should trick the AI
    test_text = "Wow, great job team. Another delay. Bullish!"
    
    print(f"📝 Analyzing text: \"{test_text}\"")
    print()
    
    try:
        result = analyze_text(test_text)
        
        print("✅ Analysis Complete!")
        print()
        print("Result (JSON):")
        print(json.dumps(result, indent=2))
        print()
        
        # Highlight if it got it wrong (this is sarcastic, should be NEGATIVE)
        if result["sentiment"] == "POSITIVE":
            print("⚠️  WARNING: This text is sarcastic and should be NEGATIVE!")
            print("   The baseline agent failed to detect sarcasm.")
        else:
            print("✓ Correctly identified as NEGATIVE (sarcastic).")
            
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

