#!/usr/bin/env python3
"""
Test task creation and retrieval to debug the issue.
"""

import requests
import json
import time
import os
from dotenv import load_dotenv

load_dotenv()

def test_task_lifecycle():
    """Test the complete task creation and retrieval lifecycle."""
    
    print("🧪 Testing Task Creation and Retrieval Lifecycle")
    print("=" * 60)
    
    # Step 1: Check initial state
    print("\n1️⃣ Checking initial state...")
    response = requests.get("http://localhost:3000/api/v1/tasks")
    initial_tasks = response.json() if response.status_code == 200 else []
    print(f"   Initial tasks: {len(initial_tasks)}")
    
    # Step 2: Create a task using the SDK (simulate what the agent does)
    print("\n2️⃣ Creating task via SDK...")
    
    # Import the SDK
    import sys
    sys.path.append('../main-app/sdk/src')
    
    try:
        from human_rpc_sdk import AutoAgent
        
        # Create agent
        agent = AutoAgent(
            solana_private_key=os.getenv("AGENT_PRIVATE_KEY"),
            human_rpc_url="http://localhost:3000/api/v1/tasks"
        )
        
        # Prepare context
        context = {
            "type": "ai_verification",
            "summary": "Test task creation",
            "data": {
                "userQuery": "Test message",
                "agentConclusion": "POSITIVE",
                "confidence": 0.5,
                "reasoning": "This is a test"
            }
        }
        
        print("   Calling ask_human_rpc...")
        
        # This should create a task and return a result
        try:
            result = agent.ask_human_rpc(
                text="Test message",
                agentName="TestAgent",
                reward="0.1 USDC",
                rewardAmount=0.1,
                category="Test",
                escrowAmount="0.2 USDC",
                context=context
            )
            print(f"   ✅ SDK call completed: {result}")
        except Exception as e:
            print(f"   ❌ SDK call failed: {e}")
            
            # Let's check if a task was created anyway
            print("\n3️⃣ Checking if task was created despite error...")
            response = requests.get("http://localhost:3000/api/v1/tasks")
            if response.status_code == 200:
                current_tasks = response.json()
                print(f"   Current tasks: {len(current_tasks)}")
                
                if len(current_tasks) > len(initial_tasks):
                    new_task = current_tasks[0]  # Most recent
                    task_id = new_task.get('id') or new_task.get('taskId')
                    print(f"   📋 New task found: {task_id}")
                    
                    # Test individual task retrieval
                    print(f"\n4️⃣ Testing individual task retrieval...")
                    task_response = requests.get(f"http://localhost:3000/api/v1/tasks/{task_id}")
                    print(f"   Status: {task_response.status_code}")
                    
                    if task_response.status_code == 200:
                        task_data = task_response.json()
                        print(f"   ✅ Task retrieved: {task_data.get('id', 'N/A')}")
                    else:
                        print(f"   ❌ Task not found: {task_response.text[:200]}")
                else:
                    print("   ❌ No new task created")
            else:
                print(f"   ❌ Failed to get tasks: {response.status_code}")
    
    except ImportError as e:
        print(f"   ❌ Failed to import SDK: {e}")
        print("   Make sure the SDK is properly installed")

if __name__ == "__main__":
    test_task_lifecycle()