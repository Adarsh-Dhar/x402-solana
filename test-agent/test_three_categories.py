#!/usr/bin/env python3
"""
Test script to demonstrate the three task categories: ongoing, aborted, and completed.
"""

import json
import os
import sys
import time
import requests
import threading
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent

# Load environment variables
load_dotenv()

def check_task_categories():
    """Check all three task categories."""
    print("📊 Current Task Categories:")
    
    categories = ["ongoing", "aborted", "completed"]
    
    for category in categories:
        try:
            response = requests.get(f'http://localhost:3000/api/v1/tasks?category={category}')
            if response.status_code == 200:
                tasks = response.json()
                print(f"   📋 {category.title()}: {len(tasks)} tasks")
                for task in tasks[:2]:  # Show first 2 tasks
                    print(f"      • {task['id']} - {task['agentName']} ({task['status']})")
                if len(tasks) > 2:
                    print(f"      ... and {len(tasks) - 2} more")
            else:
                print(f"   ❌ {category.title()}: API error {response.status_code}")
        except Exception as e:
            print(f"   ❌ {category.title()}: Error {e}")
    
    print()

def analyze_text_simple(text: str) -> dict:
    """Simple AI analysis that returns low confidence to trigger Human RPC."""
    # Return a low-confidence result for demo
    return {
        "userQuery": text,
        "agentConclusion": "NEGATIVE",
        "confidence": 0.45,  # Low confidence to trigger Human RPC
        "reasoning": "Ambiguous statement requiring human verification"
    }

def main():
    """Main test function."""
    print("=" * 70)
    print("🎯 Testing Three Task Categories: Ongoing, Aborted, Completed")
    print("=" * 70)
    print()
    
    # Check initial status
    print("🔍 Initial System Status:")
    check_task_categories()
    
    # Create agent with session management
    print("🚀 Creating test agent...")
    agent = AutoAgent(
        network="devnet",
        timeout=30,
        default_agent_name="CategoryTestAgent-v1",
        default_reward="0.4 USDC",
        default_reward_amount=0.4,
        default_category="Category Test",
        default_escrow_amount="0.8 USDC",
        enable_session_management=True,
        heartbeat_interval=30
    )
    
    print(f"✅ Agent created with session: {agent.session_id}")
    print()
    
    # Create a task that will be aborted
    print("📝 Creating task that will be aborted...")
    
    def create_task():
        try:
            test_text = "This task will be aborted when the agent terminates."
            ai_result = analyze_text_simple(test_text)
            
            context = {
                "type": "ai_verification",
                "summary": f"Test task for abort demo. Confidence: {ai_result['confidence']:.3f}",
                "data": {
                    "userQuery": ai_result["userQuery"],
                    "agentConclusion": ai_result["agentConclusion"],
                    "confidence": ai_result["confidence"],
                    "reasoning": ai_result["reasoning"]
                }
            }
            
            # This will create the task but we'll abort it
            result = agent.ask_human_rpc(
                text=ai_result["userQuery"],
                context=context
            )
            
        except Exception as e:
            print(f"❌ Task creation error: {e}")
    
    # Start task creation in background
    task_thread = threading.Thread(target=create_task, daemon=True)
    task_thread.start()
    
    # Wait for task to be created
    print("⏳ Waiting for task creation...")
    time.sleep(8)
    
    print("📊 Status after task creation (should show 1 ongoing task):")
    check_task_categories()
    
    # Now terminate the agent to abort the task
    print("🛑 Terminating agent to demonstrate task abortion...")
    agent.terminate_session()
    
    # Wait for cleanup
    time.sleep(2)
    
    print("📊 Status after agent termination (should show 1 aborted task):")
    check_task_categories()
    
    print("=" * 70)
    print("✅ Three-Category System Test Complete!")
    print("=" * 70)
    print()
    print("Key observations:")
    print("• Tasks start in 'ongoing' category when agents are active")
    print("• Tasks move to 'aborted' category when agents terminate")
    print("• Tasks move to 'completed' category when consensus is reached")
    print("• Each category can be viewed separately in the dashboard")

if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        sys.exit(1)
    
    main()