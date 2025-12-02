#!/usr/bin/env python3
"""
Normal Agent (Baseline) - Uses LLM to analyze text for sarcasm and slang.
This baseline agent often fails on sarcasm detection.
"""

import json
import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain.prompts import ChatPromptTemplate
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel, Field


# Load environment variables
load_dotenv()


class SentimentAnalysis(BaseModel):
    """Structured output for sentiment analysis."""
    sentiment: str = Field(description="Either 'POSITIVE' or 'NEGATIVE'")
    confidence: float = Field(description="Confidence score between 0.0 and 1.0")


def analyze_text(text: str) -> dict:
    """
    Analyze text for sentiment using LLM.
    Returns a dictionary with 'sentiment' and 'confidence' keys.
    """
    # Initialize the LLM
    llm = ChatOpenAI(
        model="gpt-4o-mini",
        temperature=0.3,
        api_key=os.getenv("OPENAI_API_KEY")
    )
    
    # Create output parser for structured JSON response
    output_parser = PydanticOutputParser(pydantic_object=SentimentAnalysis)
    
    # Create prompt template
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are an expert at analyzing crypto-twitter slang and detecting sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.
Pay special attention to sarcasm, irony, and crypto-twitter slang terms.

{format_instructions}

Return ONLY valid JSON with 'sentiment' and 'confidence' fields."""),
        ("human", "Analyze this text: {text}")
    ])
    
    # Format the prompt with format instructions
    formatted_prompt = prompt.partial(format_instructions=output_parser.get_format_instructions())
    
    # Create the chain
    chain = formatted_prompt | llm | output_parser
    
    # Run the analysis
    try:
        result = chain.invoke({"text": text})
        return {
            "sentiment": result.sentiment,
            "confidence": result.confidence
        }
    except Exception as e:
        # Fallback: try to parse as JSON if Pydantic fails
        print(f"⚠️  Error in structured parsing: {e}")
        print("Attempting fallback JSON parsing...")
        
        # Fallback chain without structured output
        fallback_prompt = ChatPromptTemplate.from_messages([
            ("system", """You are an expert at analyzing crypto-twitter slang and detecting sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.
Pay special attention to sarcasm, irony, and crypto-twitter slang terms.

Return ONLY valid JSON in this exact format:
{{"sentiment": "POSITIVE" or "NEGATIVE", "confidence": 0.0-1.0}}"""),
            ("human", "Analyze this text: {text}")
        ])
        
        fallback_chain = fallback_prompt | llm
        response = fallback_chain.invoke({"text": text})
        
        # Try to extract JSON from response
        content = response.content if hasattr(response, 'content') else str(response)
        # Try to find JSON in the response
        start_idx = content.find('{')
        end_idx = content.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = content[start_idx:end_idx]
            return json.loads(json_str)
        else:
            raise ValueError(f"Could not parse JSON from response: {content}")


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

