#!/usr/bin/env python3
"""
Direct database cleanup for old tasks without sessions.
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv(os.path.join(os.path.dirname(__file__), '..', 'main-app', 'human-rpc-app', '.env'))

def cleanup_old_tasks():
    """Clean up old tasks that don't have agent sessions."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("❌ DATABASE_URL not found in environment")
        return
    
    print("=" * 60)
    print("Cleaning Up Old Tasks Without Sessions")
    print("=" * 60)
    print()
    
    try:
        # Clean up the database URL for psycopg2
        clean_url = database_url.replace("?schema=public", "")
        
        # Connect to database
        conn = psycopg2.connect(clean_url)
        cur = conn.cursor()
        
        # Count tasks without sessions
        cur.execute("""
            SELECT COUNT(*) FROM "Task" 
            WHERE "agentSessionId" IS NULL 
            AND "status" IN ('pending', 'urgent')
        """)
        old_task_count = cur.fetchone()[0]
        
        print(f"📊 Found {old_task_count} old tasks without sessions")
        
        if old_task_count > 0:
            # Delete old tasks
            cur.execute("""
                DELETE FROM "Task" 
                WHERE "agentSessionId" IS NULL 
                AND "status" IN ('pending', 'urgent')
            """)
            
            deleted_count = cur.rowcount
            conn.commit()
            
            print(f"🗑️  Deleted {deleted_count} old tasks")
        else:
            print("✅ No old tasks to clean up")
        
        # Count remaining tasks
        cur.execute('SELECT COUNT(*) FROM "Task"')
        remaining_count = cur.fetchone()[0]
        
        print(f"📈 {remaining_count} tasks remaining in database")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Database error: {e}")
    
    print()
    print("=" * 60)
    print("Database Cleanup Complete")
    print("=" * 60)

if __name__ == "__main__":
    cleanup_old_tasks()