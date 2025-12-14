#!/usr/bin/env python3
"""
Quick script to clean up old test tasks.
Run this when you have leftover tasks from testing.
"""

import requests
import psycopg2
from datetime import datetime, timedelta

# Database connection (matches the .env.local config)
DB_CONFIG = {
    'host': 'localhost',
    'port': 5435,
    'database': 'postgres',
    'user': 'postgres',
    'password': 'example'
}

def cleanup_test_tasks():
    """Clean up all pending tasks from testing."""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Count pending tasks
        cursor.execute('SELECT COUNT(*) FROM "Task" WHERE status = \'pending\'')
        pending_count = cursor.fetchone()[0]
        
        if pending_count == 0:
            print("✅ No pending tasks found. Database is clean!")
            return
        
        print(f"🧹 Found {pending_count} pending tasks. Cleaning up...")
        
        # Delete all pending tasks
        cursor.execute('DELETE FROM "Task" WHERE status = \'pending\'')
        deleted_count = cursor.rowcount
        conn.commit()
        
        print(f"✅ Successfully deleted {deleted_count} pending tasks.")
        
    except Exception as e:
        print(f"❌ Error cleaning up tasks: {e}")
    finally:
        if 'cursor' in locals():
            cursor.close()
        if 'conn' in locals():
            conn.close()

def check_api_status():
    """Check if the Human RPC API is running."""
    try:
        response = requests.get("http://localhost:3000/api/v1/tasks", timeout=5)
        if response.status_code == 200:
            tasks = response.json()
            print(f"🌐 API is running. Current tasks: {len(tasks)}")
            return True
        else:
            print(f"⚠️  API returned status {response.status_code}")
            return False
    except requests.exceptions.ConnectionError:
        print("❌ API is not running. Start the Next.js app first:")
        print("   cd main-app/human-rpc-app && npm run dev")
        return False
    except Exception as e:
        print(f"❌ Error checking API: {e}")
        return False

if __name__ == "__main__":
    print("🧹 Human RPC Task Cleanup Tool")
    print("=" * 40)
    
    # Check API status first
    if check_api_status():
        cleanup_test_tasks()
    else:
        print("\n💡 Tip: Make sure the Human RPC app is running before testing agents.")