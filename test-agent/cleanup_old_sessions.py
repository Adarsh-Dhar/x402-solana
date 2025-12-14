#!/usr/bin/env python3
"""
Cleanup script for old agent sessions and tasks.
"""

import requests
import json

def cleanup_old_data():
    """Clean up old sessions and tasks."""
    base_url = "http://localhost:3000/api/v1"
    sessions_url = f"{base_url}/agent-sessions"
    tasks_url = f"{base_url}/tasks"
    
    print("=" * 60)
    print("Cleaning Up Old Agent Sessions and Tasks")
    print("=" * 60)
    print()
    
    # Get current sessions
    print("1. Fetching current sessions...")
    try:
        response = requests.get(sessions_url)
        if response.status_code == 200:
            sessions = response.json()
            print(f"✅ Found {len(sessions)} active sessions")
            
            # Terminate all sessions
            if sessions:
                print("2. Terminating all active sessions...")
                for session in sessions:
                    session_id = session['id']
                    agent_name = session['agentName']
                    
                    params = {"sessionId": session_id}
                    del_response = requests.delete(sessions_url, params=params)
                    
                    if del_response.status_code == 200:
                        result = del_response.json()
                        tasks_cleaned = result.get('tasksCleanedUp', 0)
                        print(f"   ✅ Terminated {agent_name}: {tasks_cleaned} tasks cleaned")
                    else:
                        print(f"   ❌ Failed to terminate {agent_name}: {del_response.status_code}")
            else:
                print("2. No active sessions to clean up")
        else:
            print(f"❌ Failed to fetch sessions: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error during cleanup: {e}")
    
    print()
    
    # Check remaining tasks
    print("3. Checking remaining tasks...")
    try:
        response = requests.get(tasks_url)
        if response.status_code == 200:
            tasks = response.json()
            print(f"✅ {len(tasks)} tasks remaining after cleanup")
            
            if tasks:
                print("   Remaining tasks:")
                for task in tasks[:5]:  # Show first 5
                    agent_name = task.get('agentName', 'Unknown')
                    status = task.get('status', 'unknown')
                    print(f"   • {task['id']} - {agent_name} ({status})")
                
                if len(tasks) > 5:
                    print(f"   ... and {len(tasks) - 5} more")
        else:
            print(f"❌ Failed to fetch tasks: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error checking tasks: {e}")
    
    print()
    print("=" * 60)
    print("Cleanup Complete")
    print("=" * 60)
    print()
    print("💡 Tips:")
    print("   • Sessions automatically expire after 5 minutes of no heartbeat")
    print("   • Tasks are automatically cleaned up when sessions expire")
    print("   • Use the session-managed agent for automatic cleanup")

if __name__ == "__main__":
    cleanup_old_data()