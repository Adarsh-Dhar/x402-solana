#!/usr/bin/env python3
"""
Example demonstrating reiterator functionality in the HumanRPC SDK.

This example shows how to enable automatic retry on negative consensus
and configure various reiterator settings.
"""

import os
import time
from human_rpc_sdk import AutoAgent

def main():
    """
    Demonstrate reiterator functionality with different configurations.
    """
    print("🔄 HumanRPC SDK Reiterator Example")
    print("=" * 50)
    
    # Example 1: Basic reiterator initialization
    print("\n1. Basic Reiterator Initialization")
    print("-" * 40)
    
    try:
        # Initialize AutoAgent with reiterator enabled
        agent = AutoAgent(
            solana_private_key=os.getenv("SOLANA_PRIVATE_KEY", "test_key_for_demo"),
            human_rpc_url=os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks"),
            enable_session_management=False,  # Disable for demo
            reiterator=True,  # Enable automatic retry
            max_retry_attempts=3,
            backoff_strategy="exponential",
            base_delay=1.0
        )
        
        print("✅ AutoAgent initialized with reiterator enabled")
        
        # Check initial status
        status = agent.get_reiterator_status()
        print(f"📊 Reiterator Status: {status}")
        
    except Exception as e:
        print(f"❌ Failed to initialize AutoAgent: {e}")
        return
    
    # Example 2: Dynamic enable/disable
    print("\n2. Dynamic Reiterator Control")
    print("-" * 40)
    
    # Disable reiterator
    agent.disable_reiterator()
    status = agent.get_reiterator_status()
    print(f"🔴 Reiterator disabled: enabled={status['enabled']}")
    
    # Re-enable reiterator
    agent.enable_reiterator()
    status = agent.get_reiterator_status()
    print(f"🟢 Reiterator enabled: enabled={status['enabled']}")
    
    # Example 3: Configuration details
    print("\n3. Reiterator Configuration")
    print("-" * 40)
    
    status = agent.get_reiterator_status()
    print(f"Max attempts: {status.get('max_attempts', 'N/A')}")
    print(f"Backoff strategy: {status.get('backoff_strategy', 'N/A')}")
    print(f"Base delay: {status.get('base_delay', 'N/A')}s")
    print(f"Total retries this session: {status.get('total_retries_session', 0)}")
    
    # Example 4: Different configurations
    print("\n4. Different Reiterator Configurations")
    print("-" * 40)
    
    configurations = [
        {
            "name": "Conservative",
            "max_retry_attempts": 2,
            "backoff_strategy": "linear",
            "base_delay": 2.0
        },
        {
            "name": "Aggressive", 
            "max_retry_attempts": 5,
            "backoff_strategy": "exponential",
            "base_delay": 0.5
        },
        {
            "name": "Fixed Delay",
            "max_retry_attempts": 3,
            "backoff_strategy": "fixed",
            "base_delay": 1.5
        }
    ]
    
    for config in configurations:
        print(f"\n{config['name']} Configuration:")
        try:
            test_agent = AutoAgent(
                solana_private_key="test_key_for_demo",
                enable_session_management=False,
                reiterator=True,
                **{k: v for k, v in config.items() if k != "name"}
            )
            
            status = test_agent.get_reiterator_status()
            print(f"  ✅ Max attempts: {status['max_attempts']}")
            print(f"  ✅ Strategy: {status['backoff_strategy']}")
            print(f"  ✅ Base delay: {status['base_delay']}s")
            
        except Exception as e:
            print(f"  ❌ Configuration failed: {e}")
    
    # Example 5: Cost and delay warnings
    print("\n5. Important Considerations")
    print("-" * 40)
    print("⚠️  COST WARNING:")
    print("   - Each retry attempt may incur additional costs")
    print("   - Monitor your usage and set appropriate max_attempts")
    print("   - Consider the total cost: base_cost × max_attempts")
    
    print("\n⏱️  DELAY WARNING:")
    print("   - Exponential backoff can lead to significant delays")
    print("   - With base_delay=1.0 and exponential strategy:")
    print("     - Attempt 1: immediate")
    print("     - Attempt 2: ~1s delay") 
    print("     - Attempt 3: ~2s delay")
    print("     - Attempt 4: ~4s delay")
    print("     - Total time: ~7+ seconds")
    
    print("\n🎯 BEST PRACTICES:")
    print("   - Start with conservative settings (max_attempts=2-3)")
    print("   - Use linear backoff for predictable timing")
    print("   - Monitor reiterator status during development")
    print("   - Test with mock scenarios before production use")
    
    print("\n✅ Reiterator example completed!")

if __name__ == "__main__":
    main()