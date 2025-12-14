#!/usr/bin/env python3
"""
Debug script to test the Human RPC API directly.
"""

import requests
import json
import os
from dotenv import load_dotenv

load_dotenv()

def test_task_creation():
    """Test creating a task directly via API."""
    
    url = "http://localhost:3000/api/v1/tasks"
    
    # Prepare test payload
    payload = {
        "text": "Test message for debugging",
        "task_type": "sentiment_analysis",
        "agentName": "DebugAgent",
        "reward": "0.1 USDC",
        "rewardAmount": 0.1,
        "category": "Debug",
        "escrowAmount": "0.2 USDC",
        "context": {
            "type": "ai_verification",
            "summary": "Debug test task",
            "data": {
                "userQuery": "Test message for debugging",
                "agentConclusion": "POSITIVE",
                "confidence": 0.5,
                "reasoning": "This is a debug test"
            }
        }
    }
    
    headers = {"Content-Type": "application/json"}
    
    print("🧪 Testing task creation without payment...")
    print(f"URL: {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        print(f"\nResponse Status: {response.status_code}")
        print(f"Response Headers: {dict(response.headers)}")
        
        if response.status_code == 402:
            print("✅ Got 402 Payment Required (expected)")
            try:
                payment_info = response.json()
                print(f"Payment Info: {json.dumps(payment_info, indent=2)}")
            except:
                print("Could not parse payment response as JSON")
                print(f"Raw response: {response.text[:500]}")
        else:
            print(f"❌ Unexpected status code: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

def test_task_retrieval():
    """Test retrieving tasks from API."""
    
    url = "http://localhost:3000/api/v1/tasks"
    
    print("\n🧪 Testing task retrieval...")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            tasks = response.json()
            print(f"✅ Got {len(tasks)} tasks")
            
            if tasks:
                print("Recent tasks:")
                for i, task in enumerate(tasks[:3]):
                    print(f"  {i+1}. ID: {task.get('id', 'N/A')[:8]}... Status: {task.get('status', 'N/A')}")
            else:
                print("No tasks found")
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

def test_specific_task(task_id):
    """Test retrieving a specific task."""
    
    url = f"http://localhost:3000/api/v1/tasks/{task_id}"
    
    print(f"\n🧪 Testing specific task retrieval...")
    print(f"URL: {url}")
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Response Status: {response.status_code}")
        
        if response.status_code == 200:
            task = response.json()
            print(f"✅ Task found: {task.get('id', 'N/A')}")
            print(f"Status: {task.get('status', 'N/A')}")
        elif response.status_code == 404:
            print("❌ Task not found (404)")
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    print("🔍 Human RPC API Debug Tool")
    print("=" * 50)
    
    # Test basic API functionality
    test_task_creation()
    test_task_retrieval()
    
    # Test with a known task ID from recent runs
    test_task_id = "cmj4y9gy80007u6pyekdskhlk"  # From the last agent run
    test_specific_task(test_task_id)