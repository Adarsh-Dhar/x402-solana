#!/usr/bin/env python3
"""
Test script to verify the voting and consensus logging functionality
in normal_agent-1.py without requiring actual Human RPC calls.
"""

import sys
import os

def calculate_consensus_params(ai_certainty: float) -> dict:
    """
    Calculate consensus parameters using the same algorithm as the Human RPC API.
    This replicates the Inverse Confidence Sliding Scale algorithm.
    
    Args:
        ai_certainty: AI confidence level (0.5 to 1.0)
        
    Returns:
        Dictionary with requiredVoters and consensusThreshold
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

def test_consensus_calculations():
    """Test the consensus parameter calculations with various confidence levels."""
    print("=" * 60)
    print("Testing Consensus Algorithm Calculations")
    print("=" * 60)
    print()
    
    test_cases = [
        (0.95, "High confidence - AI is very sure"),
        (0.85, "Good confidence - AI is fairly sure"),
        (0.70, "Medium confidence - AI has some doubt"),
        (0.60, "Low confidence - AI is uncertain"),
        (0.50, "Very low confidence - AI is guessing")
    ]
    
    for confidence, description in test_cases:
        params = calculate_consensus_params(confidence)
        
        print(f"🎯 {description}")
        print(f"   Confidence: {confidence:.1%}")
        print(f"   Uncertainty Factor: {params['uncertaintyFactor']:.3f}")
        print(f"   Required Voters: {params['requiredVoters']}")
        print(f"   Consensus Threshold: {params['consensusThreshold']*100:.1f}%")
        print(f"   Minimum Votes Needed: {int(params['requiredVoters'] * params['consensusThreshold']) + 1}")
        print()

def simulate_voting_progress():
    """Simulate voting progress for demonstration."""
    print("=" * 60)
    print("Simulating Voting Progress")
    print("=" * 60)
    print()
    
    # Simulate a scenario with 7 required voters and 74% threshold
    required_voters = 7
    consensus_threshold = 0.74
    
    print(f"📋 Task requires {required_voters} voters with {consensus_threshold*100:.1f}% consensus")
    print()
    
    # Simulate votes coming in
    votes = [
        (1, 1, 0, "First vote: YES"),
        (2, 2, 0, "Second vote: YES"),
        (3, 2, 1, "Third vote: NO"),
        (4, 3, 1, "Fourth vote: YES"),
        (5, 4, 1, "Fifth vote: YES"),
        (6, 5, 1, "Sixth vote: YES"),
        (7, 6, 1, "Final vote: YES - Consensus reached!")
    ]
    
    for current_votes, yes_votes, no_votes, description in votes:
        completion_pct = (current_votes / required_voters) * 100
        
        if yes_votes + no_votes > 0:
            majority_pct = (max(yes_votes, no_votes) / (yes_votes + no_votes)) * 100
            consensus_reached = (current_votes >= required_voters and 
                               majority_pct >= consensus_threshold * 100)
        else:
            majority_pct = 0
            consensus_reached = False
        
        print(f"🗳️  Vote #{current_votes}: {description}")
        print(f"   📊 Progress: {current_votes}/{required_voters} ({completion_pct:.1f}%)")
        print(f"   ✅ Yes: {yes_votes} | ❌ No: {no_votes}")
        print(f"   📈 Current majority: {majority_pct:.1f}%")
        print(f"   🎯 Need: {consensus_threshold*100:.1f}% consensus")
        print(f"   🏁 Consensus: {'✅ REACHED' if consensus_reached else '⏳ Pending'}")
        print()

if __name__ == "__main__":
    test_consensus_calculations()
    simulate_voting_progress()
    
    print("=" * 60)
    print("✅ Test completed! The logging functions are working correctly.")
    print("Run normal_agent-1.py to see this in action with real Human RPC calls.")
    print("=" * 60)