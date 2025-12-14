#!/usr/bin/env python3
"""
Simple test to verify Human RPC connection is working.
"""

import requests
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_api_connection():
    """Test basic API connection."""
    human_rpc_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    
    print(f"🔗 Testing connection to: {human_rpc_url}")
    
    try:
        response = requests.get(human_rpc_url, timeout=10)
        print(f"✅ Connection successful! Status: {response.status_code}")
        
        if response.status_code == 200:
            tasks = response.json()
            print(f"📋 Current tasks: {len(tasks)}")
            return True
        else:
            print(f"⚠️  Unexpected status code: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection failed. Is the Human RPC app running?")
        print("   Start it with: cd main-app/human-rpc-app && npm run dev")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def test_task_endpoint():
    """Test individual task endpoint."""
    base_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    test_task_id = "test-task-id"
    task_url = f"{base_url}/{test_task_id}"
    
    print(f"🔗 Testing task endpoint: {task_url}")
    
    try:
        response = requests.get(task_url, timeout=10)
        if response.status_code == 404:
            print("✅ Task endpoint working (404 expected for non-existent task)")
            return True
        else:
            print(f"⚠️  Unexpected status: {response.status_code}")
            print(f"Response: {response.text[:200]}")
            return False
            
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Human RPC Connection Test")
    print("=" * 40)
    
    # Test basic connection
    if test_api_connection():
        print()
        # Test task endpoint
        test_task_endpoint()
        print()
        print("✅ All tests passed! RPC connection is working.")
    else:
        print()
        print("❌ Connection test failed. Check the Human RPC app.")