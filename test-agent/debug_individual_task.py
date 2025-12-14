#!/usr/bin/env python3
"""
Debug the individual task endpoint to see why it returns 404.
"""

import requests
import json

def test_individual_task_endpoint():
    """Test the individual task endpoint with detailed debugging."""
    
    task_id = "cmj4z6r3d000au6py7kgtrqgc"
    url = f"http://localhost:3000/api/v1/tasks/{task_id}"
    
    print(f"🧪 Testing Individual Task Endpoint")
    print(f"URL: {url}")
    print(f"Task ID: {task_id}")
    print("=" * 60)
    
    try:
        # Make the request with detailed headers
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "User-Agent": "DebugScript/1.0"
        }
        
        print("📡 Making request...")
        response = requests.get(url, headers=headers, timeout=10)
        
        print(f"Status Code: {response.status_code}")
        print(f"Headers: {dict(response.headers)}")
        print(f"Content-Type: {response.headers.get('content-type', 'N/A')}")
        
        if response.status_code == 200:
            print("✅ Success!")
            try:
                data = response.json()
                print(f"Response: {json.dumps(data, indent=2)}")
            except:
                print(f"Raw response: {response.text}")
        elif response.status_code == 404:
            print("❌ 404 Not Found")
            print("This means the API endpoint couldn't find the task")
            
            # Check if it's returning HTML (Next.js error page) or JSON
            content_type = response.headers.get('content-type', '')
            if 'text/html' in content_type:
                print("📄 Response is HTML (Next.js error page)")
                print("This suggests the API route itself is working but returning 404")
            elif 'application/json' in content_type:
                print("📄 Response is JSON")
                try:
                    error_data = response.json()
                    print(f"Error details: {json.dumps(error_data, indent=2)}")
                except:
                    print(f"Raw error response: {response.text[:500]}")
            else:
                print(f"📄 Unexpected content type: {content_type}")
                print(f"Raw response: {response.text[:500]}")
        else:
            print(f"❌ Unexpected status: {response.status_code}")
            print(f"Response: {response.text[:500]}")
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection failed - is the Next.js server running?")
    except Exception as e:
        print(f"❌ Error: {e}")

def test_task_list_endpoint():
    """Test the task list endpoint to compare."""
    
    url = "http://localhost:3000/api/v1/tasks"
    
    print(f"\n🧪 Testing Task List Endpoint (for comparison)")
    print(f"URL: {url}")
    print("=" * 60)
    
    try:
        response = requests.get(url, timeout=10)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            tasks = response.json()
            print(f"✅ Found {len(tasks)} tasks")
            
            if tasks:
                task = tasks[0]
                print(f"First task:")
                print(f"  Display ID: {task.get('id', 'N/A')}")
                print(f"  Full Task ID: {task.get('taskId', 'N/A')}")
                print(f"  Agent: {task.get('agentName', 'N/A')}")
                print(f"  Status: {task.get('status', 'N/A')}")
        else:
            print(f"❌ Failed: {response.status_code}")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_individual_task_endpoint()
    test_task_list_endpoint()