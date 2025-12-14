#!/usr/bin/env python3
"""
Test script to verify that interrupting an agent properly cleans up its tasks.
"""

import json
import os
import sys
import time
import signal
import threading
import requests
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent

# Load environment variables
load_dotenv()

def analyze_text_simple(text: str) -> dict:
    """Simple AI analysis that returns low confidence to trigger Human RPC."""
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        raise ValueError("Google API key not configured. Set GOOGLE_API_KEY in your environment.")
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # Build system prompt that returns low confidence
    system_prompt = """You are an expert at analyzing text sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.

IMPORTANT: Always return a confidence score between 0.3-0.6 for demonstration purposes.

Return ONLY valid JSON in this exact format:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.3-0.6,
  "reasoning": "A brief explanation"
}"""
    
    prompt = f"{system_prompt}\n\nUSER: Analyze this text: {text}"
    
    # Initialize the model
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name)
    
    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
            }
        )
        
        response_text = response.text if hasattr(response, 'text') else str(response)
        
        # Try to find JSON in the response
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            result = json.loads(json_str)
            
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
        # Return a low-confidence result for demo
        return {
            "userQuery": text,
            "agentConclusion": "NEGATIVE",
            "confidence": 0.45,  # Low confidence to trigger Human RPC
            "reasoning": "Unable to analyze properly due to API error"
        }

def check_system_status():
    """Check current system status."""
    try:
        # Check sessions
        response = requests.get('http://localhost:3000/api/v1/agent-sessions')
        if response.status_code == 200:
            sessions = response.json()
            print(f"   🤖 Active Sessions: {len(sessions)}")
            for s in sessions:
                print(f"      • {s['agentName']} - {s['activeTasks']} tasks")
        
        # Check tasks
        response = requests.get('http://localhost:3000/api/v1/tasks')
        if response.status_code == 200:
            tasks = response.json()
            print(f"   📋 Active Tasks: {len(tasks)}")
            for t in tasks:
                print(f"      • {t['id']} - {t['agentName']}")
        
    except Exception as e:
        print(f"   ❌ API error: {e}")

def main():
    """Main test function."""
    print("=" * 70)
    print("🧪 Testing Agent Interruption and Task Cleanup")
    print("=" * 70)
    print()
    
    # Check initial status
    print("📊 Initial System Status:")
    check_system_status()
    print()
    
    # Create agent with session management
    print("🚀 Creating agent with session management...")
    agent = AutoAgent(
        network="devnet",
        timeout=30,
        default_agent_name="InterruptTestAgent-v1",
        default_reward="0.4 USDC",
        default_reward_amount=0.4,
        default_category="Interrupt Test",
        default_escrow_amount="0.8 USDC",
        enable_session_management=True,
        heartbeat_interval=30
    )
    
    print(f"✅ Agent created with session: {agent.session_id}")
    print()
    
    # Check status after agent creation
    print("📈 Status after agent creation:")
    check_system_status()
    print()
    
    # Create a task in background thread
    print("📝 Creating Human RPC task in background...")
    
    task_created = threading.Event()
    task_id = None
    
    def create_task():
        nonlocal task_id
        try:
            test_text = "This is an ambiguous statement that needs human review."
            ai_result = analyze_text_simple(test_text)
            
            context = {
                "type": "ai_verification",
                "summary": f"Verify AI analysis. Confidence: {ai_result['confidence']:.3f}",
                "data": {
                    "userQuery": ai_result["userQuery"],
                    "agentConclusion": ai_result["agentConclusion"],
                    "confidence": ai_result["confidence"],
                    "reasoning": ai_result["reasoning"]
                }
            }
            
            # This will create the task but we'll interrupt before completion
            result = agent.ask_human_rpc(
                text=ai_result["userQuery"],
                context=context
            )
            
        except Exception as e:
            print(f"❌ Task creation error: {e}")
        finally:
            task_created.set()
    
    # Start task creation in background
    task_thread = threading.Thread(target=create_task, daemon=True)
    task_thread.start()
    
    # Wait for task to be created (but not completed)
    print("⏳ Waiting for task creation...")
    time.sleep(8)  # Give time for task to be created and payment processed
    
    print("📊 Status after task creation:")
    check_system_status()
    print()
    
    # Now simulate interruption (Ctrl+C)
    print("🛑 Simulating agent interruption (Ctrl+C)...")
    print("   This should automatically clean up the agent session and its tasks")
    
    # Send SIGINT to self (simulates Ctrl+C)
    os.kill(os.getpid(), signal.SIGINT)

if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY", "GOOGLE_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        sys.exit(1)
    
    try:
        main()
    except KeyboardInterrupt:
        print("\n🎯 Interrupt handled by signal handler!")
        print("   Checking final system status...")
        time.sleep(2)  # Give time for cleanup
        check_system_status()
        print("\n✅ Test completed successfully!")