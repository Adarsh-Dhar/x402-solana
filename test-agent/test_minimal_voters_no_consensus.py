#!/usr/bin/env python3
"""
Test Case: Minimal Voters with No Consensus Scenario

This test demonstrates the edge case where:
1. High AI confidence (0.95) results in minimal voters (N=3) and low threshold (51%)
2. But the voting pattern can still prevent consensus from being reached
3. Shows that minimal voters ≠ guaranteed consensus

Scenario:
- AI Confidence: 95% → N=3 voters, T=51% threshold
- Voting pattern that prevents consensus (e.g., split votes)
- Demonstrates system behavior when minimal requirements still fail
"""

import json
import os
import sys
import time
from dotenv import load_dotenv

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent, HumanVerificationError, SDKConfigurationError, PaymentError

# Load environment variables
load_dotenv()


def calculate_consensus_params(ai_certainty: float) -> dict:
    """
    Calculate consensus parameters using the same algorithm as the Human RPC API.
    This replicates the Inverse Confidence Sliding Scale algorithm.
    """
    # Algorithm bounds (matching the Human RPC API)
    N_MIN = 3   # Minimum number of voters
    N_MAX = 15  # Maximum number of voters
    T_MIN = 0.51  # Minimum consensus threshold (51%)
    T_MAX = 0.90  # Maximum consensus threshold (90%)
    CERTAINTY_MIN = 0.5  # Minimum AI certainty
    CERTAINTY_MAX = 1.0  # Maximum AI certainty
    
    # Clamp certainty to valid range
    clamped_certainty = max(CERTAINTY_MIN, min(CERTAINTY_MAX, ai_certainty))
    
    # Calculate Uncertainty Factor (U)
    uncertainty = (1.0 - clamped_certainty) / (CERTAINTY_MAX - CERTAINTY_MIN)
    uncertainty = max(0, min(1, uncertainty))
    
    # Calculate Required Voters (N)
    raw_voters = N_MIN + int(uncertainty * (N_MAX - N_MIN) + 0.5)  # Round up
    voters = raw_voters + 1 if raw_voters % 2 == 0 else raw_voters  # Make odd to prevent ties
    required_voters = max(N_MIN, min(N_MAX, voters))
    
    # Calculate Consensus Threshold (T)
    consensus_threshold = T_MIN + (uncertainty * (T_MAX - T_MIN))
    consensus_threshold = max(T_MIN, min(T_MAX, consensus_threshold))
    
    return {
        "requiredVoters": required_voters,
        "consensusThreshold": consensus_threshold,
        "uncertaintyFactor": uncertainty
    }


# Initialize HumanRPC SDK for minimal voters test
agent = AutoAgent(
    network="devnet",
    timeout=30,
    default_agent_name="MinimalVotersTest-v1",
    default_reward="0.3 USDC",
    default_reward_amount=0.3,
    default_category="Minimal Voters Test",
    default_escrow_amount="0.6 USDC",
    enable_session_management=True,
    heartbeat_interval=60
)

# Set threshold to 0.96 so our 0.95 confidence still triggers Human RPC
CONFIDENCE_THRESHOLD = 0.96


def create_minimal_voters_scenario():
    """
    Create a test scenario with high AI confidence (0.95) that results in
    minimal voters (N=3) but can still fail to reach consensus.
    """
    
    # Mock AI analysis with high confidence
    ai_result = {
        "userQuery": "This crypto project looks amazing and will definitely moon!",
        "agentConclusion": "POSITIVE",
        "confidence": 0.95,  # High confidence = minimal voters
        "reasoning": "Clear positive sentiment with strong bullish indicators. High confidence for minimal voters test."
    }
    
    return ai_result


def demonstrate_minimal_voters_scenario():
    """
    Demonstrate the minimal voters scenario where high AI confidence
    results in minimal requirements but consensus can still fail.
    """
    
    print("=" * 70)
    print("🎯 MINIMAL VOTERS WITH NO CONSENSUS - TEST SCENARIO")
    print("=" * 70)
    print()
    
    # Create the test scenario
    ai_result = create_minimal_voters_scenario()
    confidence = ai_result["confidence"]
    
    # Calculate and display consensus parameters
    consensus_params = calculate_consensus_params(confidence)
    
    print("📊 TEST SCENARIO PARAMETERS:")
    print(f"   🤖 AI Confidence: {confidence:.1%} (HIGH)")
    print(f"   👥 Required Voters: {consensus_params['requiredVoters']} (MINIMAL)")
    print(f"   📈 Consensus Threshold: {consensus_params['consensusThreshold']:.1%}")
    print(f"   🎯 Votes Needed for Decision: {int(consensus_params['requiredVoters'] * consensus_params['consensusThreshold']) + 1}")
    print()
    
    print("🧮 WHY THIS IS AN EDGE CASE:")
    print("   • High AI confidence (95%) triggers minimal voting requirements")
    print("   • Only 3 voters needed with 51% threshold")
    print("   • But consensus can still fail with certain voting patterns:")
    print("     - Example 1: 1 Yes, 2 No = 66.7% majority but may not meet consensus rules")
    print("     - Example 2: Voters don't participate or abstain")
    print("     - Example 3: Technical issues prevent vote completion")
    print()
    
    print("🎲 POSSIBLE OUTCOMES:")
    print("   ✅ Success: 2+ voters agree (meets 51% threshold)")
    print("   ❌ Failure: Split votes, abstentions, or technical issues")
    print("   ⚠️  Edge Case: Even minimal requirements can fail!")
    print()
    
    # Check if we should trigger Human RPC
    if confidence < CONFIDENCE_THRESHOLD:
        print("🚀 TRIGGERING HUMAN RPC WITH MINIMAL VOTERS...")
        print(f"   Confidence {confidence:.1%} < Threshold {CONFIDENCE_THRESHOLD:.1%}")
        print()
        
        # Prepare context for Human RPC
        context = {
            "type": "minimal_voters_test",
            "summary": f"Testing minimal voters scenario. AI confidence: {confidence:.1%}",
            "data": {
                "userQuery": ai_result["userQuery"],
                "agentConclusion": ai_result["agentConclusion"],
                "confidence": confidence,
                "reasoning": ai_result["reasoning"],
                "testCase": "minimal_voters_edge_case",
                "expectedVoters": consensus_params["requiredVoters"],
                "expectedThreshold": consensus_params["consensusThreshold"]
            }
        }
        
        try:
            print("⏳ Starting Human RPC task...")
            
            # Call Human RPC
            human_result = agent.ask_human_rpc(
                text=ai_result["userQuery"],
                agentName="MinimalVotersTest-v1",
                reward="0.3 USDC",
                rewardAmount=0.3,
                category="Minimal Voters Test",
                escrowAmount="0.6 USDC",
                context=context
            )
            
            print()
            print("=" * 70)
            print("📋 TEST RESULTS")
            print("=" * 70)
            
            if human_result:
                print("✅ Human RPC completed!")
                
                # Analyze the results
                decision = human_result.get("decision", "unknown")
                consensus_reached = human_result.get("consensusReached", False)
                vote_count = human_result.get("voteCount", 0)
                
                print(f"   🎯 Final Decision: {decision}")
                print(f"   📊 Consensus Reached: {consensus_reached}")
                print(f"   👥 Total Votes: {vote_count}")
                
                if consensus_reached:
                    print("   ✅ SUCCESS: Consensus achieved with minimal voters!")
                    print("   📈 This shows the system works even with minimal requirements")
                else:
                    print("   ⚠️  NO CONSENSUS: Minimal voters scenario failed!")
                    print("   🎯 This demonstrates the edge case we're testing")
                    print("   📊 Even with minimal voters (N=3), consensus can still fail")
                
                # Show detailed voting information if available
                if "consensus" in human_result:
                    consensus_info = human_result["consensus"]
                    yes_votes = consensus_info.get("yesVotes", 0)
                    no_votes = consensus_info.get("noVotes", 0)
                    abstain_votes = consensus_info.get("abstainVotes", 0)
                    
                    print()
                    print("📊 DETAILED VOTING BREAKDOWN:")
                    print(f"   ✅ Yes Votes: {yes_votes}")
                    print(f"   ❌ No Votes: {no_votes}")
                    print(f"   ⚪ Abstain Votes: {abstain_votes}")
                    print(f"   📈 Total Participation: {yes_votes + no_votes + abstain_votes}/{consensus_params['requiredVoters']}")
                    
                    if yes_votes + no_votes > 0:
                        majority_pct = max(yes_votes, no_votes) / (yes_votes + no_votes) * 100
                        majority_side = "YES" if yes_votes > no_votes else "NO"
                        print(f"   🏆 Majority: {majority_side} ({majority_pct:.1f}%)")
                        print(f"   🎯 Required: {consensus_params['consensusThreshold']*100:.1f}%")
                
            else:
                print("❌ Human RPC failed or returned None")
                print("   This could indicate:")
                print("   • Network connectivity issues")
                print("   • Human RPC API problems")
                print("   • Insufficient wallet funds")
                print("   • Task creation failures")
            
            print()
            print("🎓 LEARNING OUTCOMES:")
            print("   • High AI confidence doesn't guarantee consensus success")
            print("   • Minimal voters (N=3) can still result in no consensus")
            print("   • System robustness requires handling edge cases")
            print("   • Consensus algorithms must account for failure scenarios")
            
        except Exception as e:
            print(f"❌ Error during Human RPC: {e}")
            print("   This demonstrates another edge case: technical failures")
            print("   Even minimal requirements can fail due to system issues")
            
    else:
        print("ℹ️  AI confidence too high - Human RPC not triggered")
        print(f"   Confidence {confidence:.1%} >= Threshold {CONFIDENCE_THRESHOLD:.1%}")
        print("   Adjust CONFIDENCE_THRESHOLD to test this scenario")


def main():
    """Main function to run the minimal voters test scenario."""
    
    print("🔧 Test Configuration:")
    print(f"   Network: {agent.network}")
    print(f"   Agent: {agent.default_agent_name}")
    print(f"   Confidence Threshold: {CONFIDENCE_THRESHOLD:.1%}")
    print(f"   Wallet: {agent.wallet.get_public_key()}")
    print()
    
    # Run the demonstration
    demonstrate_minimal_voters_scenario()


if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print()
        print("Please set these environment variables:")
        print("   export SOLANA_PRIVATE_KEY='your_base58_private_key'")
        print()
        print("For SOLANA_PRIVATE_KEY, you can generate a devnet wallet at:")
        print("   https://solfaucet.com/")
        sys.exit(1)
    
    try:
        main()
    except SDKConfigurationError as e:
        print(f"❌ SDK Configuration Error: {e}")
    except PaymentError as e:
        print(f"❌ Payment Error: {e}")
    except HumanVerificationError as e:
        print(f"❌ Human Verification Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
        import traceback
        traceback.print_exc()