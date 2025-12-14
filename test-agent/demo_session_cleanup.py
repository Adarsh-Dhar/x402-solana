#!/usr/bin/env python3
"""
Demo script showing session management and task cleanup.
"""

import json
import os
import sys
import time
import requests
import signal
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent

# Load environment variables
load_dotenv()

def check_system_status():
    """Check current system status."""
    print("📊 Current System Status:")
    
    # Check sessions
    try:
        response = requests.get('http://localhost:3000/api/v1/agent-sessions')
        if response.status_code == 200:
            sessions = response.json()
            print(f"   🤖 Active Sessions: {len(sessions)}")
            for s in sessions:
                print(f"      • {s['agentName']} - {s['activeTasks']} tasks")
        else:
            print(f"   ❌ Sessions API error: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Sessions API error: {e}")
    
    # Check tasks
    try:
        response = requests.get('http://localhost:3000/api/v1/tasks')
        if response.status_code == 200:
            tasks = response.json()
            print(f"   📋 Active Tasks: {len(tasks)}")
            for t in tasks[:3]:
                print(f"      • {t['id']} - {t['agentName']}")
            if len(tasks) > 3:
                print(f"      ... and {len(tasks) - 3} more")
        else:
            print(f"   ❌ Tasks API error: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Tasks API error: {e}")
    
    print()

def analyze_text_simple(text: str) -> dict:
    """Simple AI analysis for demonstration."""
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        raise ValueError("Google API key not configured. Set GOOGLE_API_KEY in your environment.")
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # Build system prompt
    system_prompt = """You are an expert at analyzing crypto-twitter slang and detecting sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.

IMPORTANT: Be conservative with confidence scores. Use low confidence (0.3-0.6) for demonstration purposes.

Return ONLY valid JSON in this exact format:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.0-1.0,
  "reasoning": "A brief explanation"
}"""
    
    # Build a single prompt string using system prompt + user message
    prompt = f"{system_prompt}\n\nUSER: Analyze this text: {text}"
    
    # Initialize the model
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
        # Return a low-confidence result for demo
        return {
            "userQuery": text,
            "agentConclusion": "NEGATIVE",
            "confidence": 0.45,  # Low confidence to trigger Human RPC
            "reasoning": "Unable to analyze properly due to API error"
        }

def main():
    """Main demonstration function."""
    print("=" * 70)
    print("🎯 Session Management & Task Cleanup Demo")
    print("=" * 70)
    print()
    print("This demo shows:")
    print("• Agent session creation and management")
    print("• Task creation linked to sessions")
    print("• Automatic task cleanup when sessions end")
    print()
    
    # Check initial status
    print("🔍 Initial System Status:")
    check_system_status()
    
    # Create session-managed agent
    print("🚀 Creating session-managed agent...")
    agent = AutoAgent(
        network="devnet",
        timeout=30,
        default_agent_name="DemoAgent-v1",
        default_reward="0.4 USDC",
        default_reward_amount=0.4,
        default_category="Demo",
        default_escrow_amount="0.8 USDC",
        enable_session_management=True,
        heartbeat_interval=30  # 30 second heartbeats for demo
    )
    
    print(f"✅ Agent created with session: {agent.session_id}")
    print()
    
    # Check status after agent creation
    print("📈 Status after agent creation:")
    check_system_status()
    
    # Create a task that will trigger Human RPC
    test_text = "This is a somewhat ambiguous statement that might be sarcastic."
    print(f"📝 Creating task: \"{test_text}\"")
    
    try:
        # Run AI analysis (configured to return low confidence)
        ai_result = analyze_text_simple(test_text)
        confidence = ai_result.get("confidence", 1.0)
        conclusion = ai_result.get("agentConclusion", "UNKNOWN")
        
        print(f"🤖 AI Analysis: {conclusion} (confidence: {confidence:.3f})")
        
        # Check if Human RPC is needed
        if confidence < 0.75:
            print("⚠️  Low confidence - creating Human RPC task...")
            
            context = {
                "type": "ai_verification",
                "summary": f"Verify AI analysis. Confidence: {confidence:.3f}",
                "data": {
                    "userQuery": ai_result["userQuery"],
                    "agentConclusion": ai_result["agentConclusion"],
                    "confidence": confidence,
                    "reasoning": ai_result["reasoning"]
                }
            }
            
            # This will create a task linked to our session
            # We'll start it but not wait for completion
            import threading
            
            def create_task():
                try:
                    result = agent.ask_human_rpc(
                        text=ai_result["userQuery"],
                        context=context
                    )
                    print(f"✅ Task completed: {result.get('decision', 'unknown')}")
                except Exception as e:
                    print(f"❌ Task creation error: {e}")
            
            # Start task creation in background
            task_thread = threading.Thread(target=create_task, daemon=True)
            task_thread.start()
            
            # Give it time to create the task
            time.sleep(5)
            
            print("📊 Status after task creation:")
            check_system_status()
            
        else:
            print("✅ AI was confident enough - no human verification needed")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    
    print("⏳ Waiting 10 seconds before cleanup...")
    time.sleep(10)
    
    # Terminate the agent session
    print("🛑 Terminating agent session...")
    agent.terminate_session()
    
    # Wait a moment for cleanup
    time.sleep(2)
    
    print("🧹 Status after session termination:")
    check_system_status()
    
    print("=" * 70)
    print("✅ Demo Complete!")
    print("=" * 70)
    print()
    print("Key takeaways:")
    print("• Tasks are only visible when their agent sessions are active")
    print("• Terminating an agent session automatically cleans up its tasks")
    print("• The dashboard will only show tasks from currently running agents")
    print("• Sessions expire automatically after 5 minutes without heartbeat")

if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY", "GOOGLE_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        sys.exit(1)
    
    main()