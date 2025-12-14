#!/usr/bin/env python3
"""
Test script for agent session management API.
"""

import requests
import time
import json

def test_session_management():
    """Test the agent session management endpoints."""
    base_url = "http://localhost:3000/api/v1"
    sessions_url = f"{base_url}/agent-sessions"
    tasks_url = f"{base_url}/tasks"
    
    print("=" * 60)
    print("Testing Agent Session Management API")
    print("=" * 60)
    print()
    
    # Test 1: Create a new session
    print("1. Creating new agent session...")
    session_data = {
        "agentName": "TestAgent-v1",
        "walletAddress": "11111111111111111111111111111111",
        "metadata": {
            "test": True,
            "version": "1.0.0"
        }
    }
    
    response = requests.post(sessions_url, json=session_data)
    print(f"   Response status: {response.status_code}")
    print(f"   Response text: {response.text}")
    
    if response.status_code == 200:
        try:
            session_result = response.json()
            session_id = session_result["sessionId"]
            print(f"✅ Session created: {session_id}")
            print(f"   Status: {session_result['status']}")
            print(f"   Message: {session_result['message']}")
        except Exception as e:
            print(f"❌ Failed to parse JSON: {e}")
            return
    else:
        print(f"❌ Failed to create session: {response.status_code}")
        print(f"   Response: {response.text}")
        return
    
    print()
    
    # Test 2: Get active sessions
    print("2. Fetching active sessions...")
    response = requests.get(sessions_url)
    if response.status_code == 200:
        sessions = response.json()
        print(f"✅ Found {len(sessions)} active sessions:")
        for session in sessions:
            print(f"   • {session['agentName']} ({session['id'][:8]}...)")
            print(f"     Status: {session['status']}, Tasks: {session['activeTasks']}")
    else:
        print(f"❌ Failed to fetch sessions: {response.status_code}")
    
    print()
    
    # Test 3: Update session (heartbeat)
    print("3. Sending heartbeat...")
    response = requests.post(sessions_url, json=session_data)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Heartbeat sent: {result['message']}")
    else:
        print(f"❌ Failed to send heartbeat: {response.status_code}")
    
    print()
    
    # Test 4: Check tasks (should show tasks from active sessions only)
    print("4. Checking active tasks...")
    response = requests.get(tasks_url)
    if response.status_code == 200:
        tasks = response.json()
        print(f"✅ Found {len(tasks)} active tasks")
        for task in tasks[:3]:  # Show first 3
            agent_name = task.get('agentName', 'Unknown')
            print(f"   • {task['id']} - {agent_name}")
    else:
        print(f"❌ Failed to fetch tasks: {response.status_code}")
    
    print()
    
    # Test 5: Wait and test session expiry
    print("5. Testing session expiry (waiting 6 minutes for timeout)...")
    print("   Note: Sessions expire after 5 minutes of no heartbeat")
    print("   You can skip this by pressing Ctrl+C")
    
    try:
        # Wait for session to expire (5 minute timeout + 1 minute buffer)
        for i in range(360):  # 6 minutes
            time.sleep(1)
            if i % 30 == 0:  # Print every 30 seconds
                remaining = 360 - i
                print(f"   ⏳ Waiting... {remaining}s remaining")
        
        # Check if session expired
        print("   Checking if session expired...")
        response = requests.get(sessions_url)
        if response.status_code == 200:
            sessions = response.json()
            active_test_sessions = [s for s in sessions if s['agentName'] == 'TestAgent-v1']
            if len(active_test_sessions) == 0:
                print("   ✅ Session expired as expected")
            else:
                print("   ⚠️  Session still active (may need longer wait)")
        
    except KeyboardInterrupt:
        print("\n   ⏭️  Skipping expiry test")
    
    print()
    
    # Test 6: Manually terminate session
    print("6. Manually terminating session...")
    params = {"sessionId": session_id}
    response = requests.delete(sessions_url, params=params)
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Session terminated: {result['message']}")
        print(f"   Tasks cleaned up: {result['tasksCleanedUp']}")
    else:
        print(f"❌ Failed to terminate session: {response.status_code}")
        print(f"   Response: {response.text}")
    
    print()
    
    # Test 7: Verify session is gone
    print("7. Verifying session cleanup...")
    response = requests.get(sessions_url)
    if response.status_code == 200:
        sessions = response.json()
        remaining_test_sessions = [s for s in sessions if s['agentName'] == 'TestAgent-v1']
        if len(remaining_test_sessions) == 0:
            print("✅ Session successfully cleaned up")
        else:
            print(f"⚠️  {len(remaining_test_sessions)} test sessions still active")
    
    print()
    print("=" * 60)
    print("Session Management Test Complete")
    print("=" * 60)

if __name__ == "__main__":
    test_session_management()