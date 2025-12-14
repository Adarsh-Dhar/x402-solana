#!/usr/bin/env python3
"""
Example demonstrating dynamic reiterator control and status monitoring.

This example shows how to enable/disable reiterator during runtime
and monitor its status and progress.
"""

import os
import time
from unittest.mock import patch, Mock
from human_rpc_sdk import AutoAgent

def simulate_human_rpc_task(agent, task_description, expected_result="negative"):
    """
    Simulate a human RPC task for demonstration purposes.
    
    Args:
        agent: AutoAgent instance
        task_description: Description of the task
        expected_result: Expected sentiment result ("positive" or "negative")
    """
    print(f"\n🎯 Simulating task: {task_description}")
    
    # Mock the HTTP requests to simulate different scenarios
    with patch.object(agent, 'post') as mock_post, \
         patch.object(agent, 'get') as mock_get:
        
        # Mock task creation response
        mock_post.return_value = Mock()
        mock_post.return_value.status_code = 200
        mock_post.return_value.json.return_value = {"task_id": "demo_task_123"}
        mock_post.return_value.text = '{"task_id": "demo_task_123"}'
        
        # Mock task polling response
        mock_get.return_value = Mock()
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {
            "status": "completed",
            "result": {
                "sentiment": expected_result,
                "confidence": 0.85,
                "decision": "approve" if expected_result == "positive" else "reject"
            }
        }
        
        try:
            # Simulate the ask_human_rpc call
            context = {
                "data": {
                    "userQuery": "Test query",
                    "agentConclusion": "Test conclusion", 
                    "confidence": 0.7,
                    "reasoning": "Test reasoning"
                }
            }
            
            result = agent.ask_human_rpc(
                text=task_description,
                context=context
            )
            
            print(f"📋 Task result: {result.get('sentiment', 'unknown')}")
            return result
            
        except Exception as e:
            print(f"❌ Task failed: {e}")
            return None

def main():
    """
    Demonstrate dynamic reiterator control and monitoring.
    """
    print("🔄 Dynamic Reiterator Control Example")
    print("=" * 50)
    
    # Initialize AutoAgent without reiterator initially
    print("\n1. Initialize AutoAgent (reiterator disabled)")
    print("-" * 50)
    
    try:
        agent = AutoAgent(
            solana_private_key="demo_key",
            enable_session_management=False,
            reiterator=False  # Start with reiterator disabled
        )
        
        status = agent.get_reiterator_status()
        print(f"✅ Initial status: enabled={status['enabled']}")
        
    except Exception as e:
        print(f"❌ Failed to initialize: {e}")
        return
    
    # Test without reiterator
    print("\n2. Test Task Without Reiterator")
    print("-" * 50)
    
    print("🔴 Reiterator is DISABLED - single attempt only")
    result = simulate_human_rpc_task(agent, "Analyze sentiment: 'This is terrible'", "negative")
    
    if result:
        print(f"📊 Single attempt result: {result.get('sentiment')}")
        status = agent.get_reiterator_status()
        print(f"📈 Retry count: {status.get('total_retries_session', 0)}")
    
    # Enable reiterator dynamically
    print("\n3. Enable Reiterator Dynamically")
    print("-" * 50)
    
    agent.enable_reiterator()
    status = agent.get_reiterator_status()
    print(f"🟢 Reiterator enabled: {status['enabled']}")
    print(f"⚙️  Configuration:")
    print(f"   - Max attempts: {status.get('max_attempts', 'N/A')}")
    print(f"   - Strategy: {status.get('backoff_strategy', 'N/A')}")
    print(f"   - Base delay: {status.get('base_delay', 'N/A')}s")
    
    # Test with reiterator (simulate multiple negative results)
    print("\n4. Test Task With Reiterator (Multiple Negatives)")
    print("-" * 50)
    
    print("🟢 Reiterator is ENABLED - will retry on negative consensus")
    
    # Mock a scenario where we get multiple negative results
    call_count = 0
    
    def mock_ask_human_rpc_with_retries(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        
        print(f"   🔄 Attempt {call_count}")
        
        # Return negative for first 2 attempts, positive for 3rd
        if call_count < 3:
            return {
                "status": "Task Completed",
                "sentiment": "negative",
                "confidence": 0.8,
                "decision": "reject"
            }
        else:
            return {
                "status": "Task Completed", 
                "sentiment": "positive",
                "confidence": 0.9,
                "decision": "approve"
            }
    
    # Patch the ask_human_rpc method to simulate retries
    original_method = agent.ask_human_rpc
    agent.ask_human_rpc = mock_ask_human_rpc_with_retries
    
    try:
        print("🎯 Starting task that will require retries...")
        result = agent.ask_human_rpc("Test task with retries")
        print(f"✅ Final result after retries: {result.get('sentiment')}")
        print(f"📊 Total attempts made: {call_count}")
        
        # Check reiterator status after execution
        status = agent.get_reiterator_status()
        print(f"📈 Session retry count: {status.get('total_retries_session', 0)}")
        
    except Exception as e:
        print(f"❌ Task with retries failed: {e}")
    finally:
        # Restore original method
        agent.ask_human_rpc = original_method
    
    # Monitor status during execution
    print("\n5. Status Monitoring")
    print("-" * 50)
    
    status = agent.get_reiterator_status()
    print("📊 Current Reiterator Status:")
    for key, value in status.items():
        if key in ['enabled', 'active', 'attempt_count', 'max_attempts', 'total_retries_session']:
            print(f"   {key}: {value}")
    
    # Disable reiterator
    print("\n6. Disable Reiterator")
    print("-" * 50)
    
    agent.disable_reiterator()
    status = agent.get_reiterator_status()
    print(f"🔴 Reiterator disabled: enabled={status['enabled']}")
    print("ℹ️  Note: Reiterator object is preserved for future use")
    
    # Test configuration preservation
    print("\n7. Configuration Preservation")
    print("-" * 50)
    
    # Re-enable to show configuration is preserved
    agent.enable_reiterator()
    status = agent.get_reiterator_status()
    print("✅ Configuration preserved after disable/enable:")
    print(f"   Max attempts: {status.get('max_attempts')}")
    print(f"   Strategy: {status.get('backoff_strategy')}")
    print(f"   Base delay: {status.get('base_delay')}s")
    print(f"   Session retries: {status.get('total_retries_session', 0)} (preserved)")
    
    print("\n🎯 Key Takeaways:")
    print("-" * 50)
    print("✅ Reiterator can be enabled/disabled dynamically")
    print("✅ Configuration is preserved across enable/disable cycles")
    print("✅ Session statistics are maintained")
    print("✅ Status monitoring provides real-time insights")
    print("✅ Automatic retry works seamlessly with existing code")
    
    print("\n✅ Dynamic reiterator example completed!")

if __name__ == "__main__":
    main()