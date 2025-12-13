#!/usr/bin/env python3
"""
Test script to verify the early consensus detection logic.
This tests the scenarios you mentioned where consensus should be reached
before all voters have voted.
"""

def check_consensus_python(yes_votes, no_votes, required_voters, consensus_threshold):
    """
    Python implementation of the fixed consensus logic for testing.
    This mirrors the TypeScript logic we just implemented.
    """
    current_vote_count = yes_votes + no_votes
    
    # Calculate minimum votes needed for consensus
    min_votes_for_consensus = int(required_voters * consensus_threshold + 0.5)  # Ceiling
    
    # Check for early consensus
    early_consensus_reached = False
    decision = None
    majority_percentage = 0
    
    if current_vote_count > 0:
        # Check if YES votes can reach consensus
        if yes_votes >= min_votes_for_consensus:
            early_consensus_reached = True
            decision = "yes"
            majority_percentage = yes_votes / current_vote_count
        # Check if NO votes can reach consensus
        elif no_votes >= min_votes_for_consensus:
            early_consensus_reached = True
            decision = "no"
            majority_percentage = no_votes / current_vote_count
        else:
            # Check if it's impossible for either side to reach consensus
            remaining_votes = required_voters - current_vote_count
            max_possible_yes = yes_votes + remaining_votes
            max_possible_no = no_votes + remaining_votes
            
            # If neither side can possibly reach the minimum votes needed,
            # we need to wait for all votes and use percentage-based consensus
            if max_possible_yes < min_votes_for_consensus and max_possible_no < min_votes_for_consensus:
                # Fall back to percentage-based consensus only after all votes are in
                if current_vote_count >= required_voters:
                    majority_votes = max(yes_votes, no_votes)
                    majority_percentage = majority_votes / current_vote_count
                    
                    if majority_percentage >= consensus_threshold:
                        early_consensus_reached = True
                        decision = "yes" if yes_votes > no_votes else "no"
            else:
                # Calculate current majority percentage for display
                majority_votes = max(yes_votes, no_votes)
                majority_percentage = majority_votes / current_vote_count
    
    return {
        "reached": early_consensus_reached,
        "decision": decision,
        "majorityPercentage": majority_percentage,
        "requiredVoters": required_voters,
        "currentVoteCount": current_vote_count,
        "consensusThreshold": consensus_threshold,
        "yesVotes": yes_votes,
        "noVotes": no_votes,
        "minVotesForConsensus": min_votes_for_consensus
    }

def test_consensus_scenarios():
    """Test various consensus scenarios to verify the logic works correctly."""
    
    print("=" * 60)
    print("Testing Early Consensus Detection Logic")
    print("=" * 60)
    print()
    
    # Test scenarios
    scenarios = [
        # Your example: 5 voters, 60% threshold
        {
            "name": "Your Example: 5 voters, 60% threshold",
            "required_voters": 5,
            "consensus_threshold": 0.60,
            "test_cases": [
                (0, 0, "No votes yet"),
                (1, 0, "1 YES vote"),
                (2, 0, "2 YES votes"),
                (3, 0, "3 YES votes - Should reach consensus!"),
                (3, 1, "3 YES, 1 NO - Should still have consensus"),
                (2, 2, "2 YES, 2 NO - Tie, need more votes"),
                (1, 3, "1 YES, 3 NO - NO should win!"),
            ]
        },
        
        # Another example: 7 voters, 70% threshold
        {
            "name": "7 voters, 70% threshold",
            "required_voters": 7,
            "consensus_threshold": 0.70,
            "test_cases": [
                (0, 0, "No votes yet"),
                (2, 0, "2 YES votes"),
                (4, 0, "4 YES votes"),
                (5, 0, "5 YES votes - Should reach consensus!"),
                (4, 2, "4 YES, 2 NO - Should have consensus"),
                (3, 3, "3 YES, 3 NO - Tie, need more votes"),
                (2, 5, "2 YES, 5 NO - NO should win!"),
            ]
        },
        
        # Edge case: 3 voters, 51% threshold (simple majority)
        {
            "name": "3 voters, 51% threshold (simple majority)",
            "required_voters": 3,
            "consensus_threshold": 0.51,
            "test_cases": [
                (0, 0, "No votes yet"),
                (1, 0, "1 YES vote"),
                (2, 0, "2 YES votes - Should reach consensus!"),
                (1, 1, "1 YES, 1 NO - Need more votes"),
                (1, 2, "1 YES, 2 NO - NO should win!"),
            ]
        }
    ]
    
    for scenario in scenarios:
        print(f"🧪 {scenario['name']}")
        print(f"   Required voters: {scenario['required_voters']}")
        print(f"   Consensus threshold: {scenario['consensus_threshold']*100:.1f}%")
        
        # Calculate minimum votes needed
        min_votes = int(scenario['required_voters'] * scenario['consensus_threshold'] + 0.5)
        print(f"   Minimum votes for consensus: {min_votes}")
        print()
        
        for yes_votes, no_votes, description in scenario['test_cases']:
            result = check_consensus_python(
                yes_votes, no_votes, 
                scenario['required_voters'], 
                scenario['consensus_threshold']
            )
            
            status = "✅ CONSENSUS" if result['reached'] else "⏳ PENDING"
            decision = result['decision'].upper() if result['decision'] else "NONE"
            percentage = result['majorityPercentage'] * 100
            
            print(f"   {description}")
            print(f"      Votes: {yes_votes} YES, {no_votes} NO ({yes_votes + no_votes}/{scenario['required_voters']})")
            print(f"      Status: {status}")
            if result['reached']:
                print(f"      Decision: {decision} ({percentage:.1f}% majority)")
            print()
        
        print("-" * 40)
        print()

if __name__ == "__main__":
    test_consensus_scenarios()
    
    print("=" * 60)
    print("✅ Early consensus detection logic tested!")
    print("Key improvements:")
    print("• Consensus reached as soon as enough votes are cast")
    print("• No need to wait for all voters if outcome is clear")
    print("• Faster task completion and better user experience")
    print("=" * 60)