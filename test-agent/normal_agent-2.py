#!/usr/bin/env python3
"""
Normal Agent (Baseline) - Uses LLM to answer user questions.
This baseline agent provides answers to user questions and uses Human RPC when confidence is low.
Now integrated with HumanRPC SDK for automatic Human RPC when confidence is low.
"""

import json
import os
import sys
import time
import requests
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import (
    AutoAgent, guard, HumanVerificationError, SDKConfigurationError, PaymentError,
    ReiteratorMaxAttemptsError, ReiteratorRateLimitError, ReiteratorConfigurationError
)

# Load environment variables
load_dotenv()


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

# Initialize HumanRPC SDK with custom configuration for this agent
# The SDK auto-manages wallet creation and handles 402 Payment Required responses
agent = AutoAgent(
    network="devnet",  # Use devnet for testing, change to "mainnet-beta" for production
    timeout=30,  # Longer timeout for LLM processing
    default_agent_name="QuestionAnswerer-v2",  # Custom agent name
    default_reward="0.4 USDC",  # Higher reward for question answering (complex task)
    default_reward_amount=0.4,  # Matching float value
    default_category="Question Answering",  # Specific category for this task
    default_escrow_amount="0.8 USDC",  # 2x reward as escrow (best practice)
    enable_session_management=True,  # Enable automatic session management
    heartbeat_interval=60,  # Send heartbeat every 60 seconds
    # Reiterator configuration for automatic retry on negative consensus
    reiterator=True,  # Enable automatic retry functionality
    max_retry_attempts=3,  # Maximum number of retry attempts
    backoff_strategy="exponential",  # Exponential backoff (1s, 2s, 4s...)
    base_delay=1.0  # Base delay in seconds between retries
)

# Confidence threshold for triggering Human RPC
# Set to 0.96 so that our 0.95 confidence test case still triggers Human RPC
# This creates the scenario: High AI confidence (0.95) → Minimal voters (N=3)
# But still triggers Human RPC → Potential for no consensus with minimal voters
CONFIDENCE_THRESHOLD = 0.96


def answer_question(text: str) -> dict:
    """
    Answer user questions using LLM with manual human verification handling.
    This version allows us to start real-time polling immediately when Human RPC is triggered.
    
    For the minimal voters test case, we override the AI analysis to return high confidence (0.95)
    which will result in minimal voters (N=3) and low consensus threshold (51%).
    
    Args:
        text: The user's question
        
    Returns:
        Dictionary with required fields:
        - userQuery: The original question
        - agentConclusion: The agent's answer to the question
        - confidence: Confidence level (0.0-1.0) in the answer's correctness
        - reasoning: Why the agent thinks this is the correct answer
        - human_verdict: (optional) Human verification result if confidence was low
    """
    # Special test case: Override for minimal voters scenario
    if "what is the capital of france" in text.lower():
        print("🎯 SPECIAL TEST CASE DETECTED: Overriding AI analysis for minimal voters scenario")
        print("   • Setting confidence to 0.95 (high) to get minimal voters (N=3)")
        print("   • But still below our threshold (0.96) to trigger Human RPC")
        print("   • This creates the edge case: minimal voters but potential for no consensus")
        return {
            "userQuery": text,
            "agentConclusion": "Paris",
            "confidence": 0.95,  # High confidence = minimal voters (N=3, T=51%)
            "reasoning": "Paris is the well-known capital of France. High confidence answer for minimal voters test case."
        }
    
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        raise ValueError("Google API key not configured. Set GOOGLE_API_KEY in your environment.")
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # Build system prompt
    system_prompt = """You are a helpful AI assistant that answers user questions accurately and concisely.
Provide a clear, informative answer to the user's question.

IMPORTANT: Be conservative with confidence scores. If the question is complex, ambiguous, or requires specialized knowledge you're uncertain about, use a confidence score below 0.8. Only use high confidence (0.9+) for questions you can answer with high certainty.

Return ONLY valid JSON in this exact format:
{
  "answer": "Your clear and concise answer to the question",
  "confidence": 0.0-1.0,
  "reasoning": "A brief explanation of why you believe this answer is correct and how confident you are in it"
}"""
    
    # Build a single prompt string using system prompt + user message
    prompt = f"{system_prompt}\n\nUSER QUESTION: {text}"
    
    # Initialize the model (can be overridden with GEMINI_MODEL env var)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    model = genai.GenerativeModel(model_name)
    
    # Generate content
    try:
        response = model.generate_content(
            prompt,
            generation_config={
                "temperature": 0.3,
            }
        )
        
        # Extract response text
        response_text = response.text if hasattr(response, 'text') else str(response)
        
        # Try to find JSON in the response
        start_idx = response_text.find('{')
        end_idx = response_text.rfind('}') + 1
        if start_idx >= 0 and end_idx > start_idx:
            json_str = response_text[start_idx:end_idx]
            result = json.loads(json_str)
            
            # Validate result structure
            if 'answer' not in result or 'confidence' not in result or 'reasoning' not in result:
                raise ValueError(f"Invalid response structure: {result}")
            
            # Return new structure with all 4 required fields
            return {
                "userQuery": text,
                "agentConclusion": result['answer'],
                "confidence": float(result['confidence']),
                "reasoning": result['reasoning']
            }
        else:
            raise ValueError(f"Could not parse JSON from response: {response_text}")
            
    except Exception as e:
        print(f"⚠️  Error in Gemini API call: {e}")
        raise ValueError(f"Failed to answer question: {e}")


def handle_human_rpc_with_reiterator_support(ai_result: dict) -> dict:
    """
    Handle Human RPC with custom reiterator logic for our API response format.
    This implements manual retry logic since the SDK's reiterator doesn't recognize our API format.
    """
    confidence = ai_result.get("confidence", 1.0)
    
    # Show consensus parameters
    consensus_params = calculate_consensus_params(confidence)
    print()
    print("🧮 THIS AGENT'S VOTING REQUIREMENTS:")
    print(f"   🎯 AI Confidence: {confidence:.3f}")
    print(f"   👥 Required Voters: {consensus_params['requiredVoters']}")
    print(f"   📊 Consensus Threshold: {consensus_params['consensusThreshold'] * 100:.1f}%")
    print(f"   🎲 Minimum Votes Needed: {int(consensus_params['requiredVoters'] * consensus_params['consensusThreshold']) + 1}")
    
    # Special messaging for minimal voters case
    if confidence >= 0.95:
        print()
        print("🎯 MINIMAL VOTERS SCENARIO ACTIVE:")
        print(f"   • High AI confidence ({confidence:.1%}) = Minimal voters ({consensus_params['requiredVoters']})")
        print(f"   • Low consensus threshold ({consensus_params['consensusThreshold']:.1%})")
        print("   • Even with minimal requirements, consensus may still fail!")
        print("   • Example: 1 Yes, 2 No = 66.7% majority but no consensus decision")
        print("   • This demonstrates the edge case where minimal voters ≠ guaranteed consensus")
    
    print()
    print("⏳ Triggering Human RPC and starting real-time updates...")
    print("🔄 CUSTOM REITERATOR ACTIVE: Will retry if humans reject the answer")
    print("   • Negative consensus (consensus='no' or more NO votes) triggers retry")
    print("   • Up to 3 attempts with exponential backoff (1s, 2s, 4s...)")
    print("   • Each retry costs an additional 0.4 USDC")
    
    # Prepare context
    context = {
        "type": "ai_verification",
        "summary": f"Verify AI answer from answer_question. Confidence: {confidence:.3f}. REITERATOR TEST CASE.",
        "data": {
            "userQuery": ai_result["userQuery"],
            "agentConclusion": ai_result["agentConclusion"],
            "confidence": confidence,
            "reasoning": ai_result["reasoning"],
            "testCase": "reiterator_test_case"
        }
    }
    
    max_attempts = 3
    base_delay = 1.0
    
    for attempt in range(max_attempts):
        try:
            print(f"\n🔄 Attempt {attempt + 1}/{max_attempts}")
            
            # Temporarily disable SDK reiterator to handle manually
            original_reiterator_enabled = agent.reiterator_enabled
            agent.disable_reiterator()
            
            try:
                # Call Human RPC
                human_result = agent.ask_human_rpc(
                    text=ai_result["userQuery"],
                    agentName="QuestionAnswerer-v2",
                    reward="0.4 USDC",
                    rewardAmount=0.4,
                    category="Question Answering",
                    escrowAmount="0.8 USDC",
                    context=context
                )
            finally:
                # Restore original reiterator state
                if original_reiterator_enabled:
                    agent.enable_reiterator()
            
            if not human_result:
                print("❌ No result received")
                continue
            
            # Check if we should retry based on our API response format
            result_data = human_result.get("result", {})
            consensus = result_data.get("consensus", "unknown")
            final_votes = result_data.get("finalVotes", {})
            yes_votes = final_votes.get("yes", 0)
            no_votes = final_votes.get("no", 0)
            
            print(f"📊 Voting Results: {yes_votes} YES, {no_votes} NO")
            print(f"🎯 Consensus: {consensus}")
            
            # Determine if this is a negative result that should trigger retry
            should_retry = (
                consensus == "no" or  # API says no consensus
                no_votes > yes_votes or  # More rejections than approvals
                (yes_votes == 0 and no_votes > 0)  # All rejections
            )
            
            if not should_retry or attempt == max_attempts - 1:
                # Either positive result or final attempt
                if should_retry:
                    print("❌ FINAL ATTEMPT: No more retries available")
                    print("🚫 Humans consistently rejected the AI's answer")
                else:
                    print("✅ Positive consensus achieved!")
                
                print("\n✅ Human RPC completed!")
                # Combine AI result with human verdict
                combined_result = ai_result.copy()
                combined_result["human_verdict"] = human_result
                return combined_result
            
            # Negative result - prepare for retry
            print(f"🔄 Negative consensus detected - preparing retry...")
            
            if attempt < max_attempts - 1:
                # Calculate exponential backoff delay
                delay = base_delay * (2 ** attempt)
                print(f"⏱️  Waiting {delay:.1f}s before retry...")
                time.sleep(delay)
            
        except Exception as e:
            print(f"❌ Attempt {attempt + 1} failed: {e}")
            if attempt == max_attempts - 1:
                print("🚫 All retry attempts exhausted")
                raise
            
            # Wait before retry on error
            delay = base_delay * (2 ** attempt)
            print(f"⏱️  Waiting {delay:.1f}s before retry...")
            time.sleep(delay)
    
    # This should not be reached
    print("❌ Unexpected end of retry loop")
    return ai_result


def handle_human_rpc_with_realtime_polling(ai_result: dict) -> dict:
    """
    Handle Human RPC using the SDK's built-in polling.
    The SDK handles task creation and polling internally.
    
    For the minimal voters test case, this demonstrates the edge case where:
    - High AI confidence (0.95) results in minimal voters (N=3) and low threshold (51%)
    - But the voting pattern can still prevent consensus from being reached
    """
    confidence = ai_result.get("confidence", 1.0)
    
    # Show consensus parameters
    consensus_params = calculate_consensus_params(confidence)
    print()
    print("🧮 THIS AGENT'S VOTING REQUIREMENTS:")
    print(f"   🎯 AI Confidence: {confidence:.3f}")
    print(f"   👥 Required Voters: {consensus_params['requiredVoters']}")
    print(f"   📊 Consensus Threshold: {consensus_params['consensusThreshold'] * 100:.1f}%")
    print(f"   🎲 Minimum Votes Needed: {int(consensus_params['requiredVoters'] * consensus_params['consensusThreshold']) + 1}")
    
    # Special messaging for minimal voters case
    if confidence >= 0.95:
        print()
        print("🎯 MINIMAL VOTERS SCENARIO ACTIVE:")
        print(f"   • High AI confidence ({confidence:.1%}) = Minimal voters ({consensus_params['requiredVoters']})")
        print(f"   • Low consensus threshold ({consensus_params['consensusThreshold']:.1%})")
        print("   • Even with minimal requirements, consensus may still fail!")
        print("   • Example: 1 Yes, 2 No = 66.7% majority but no consensus decision")
        print("   • This demonstrates the edge case where minimal voters ≠ guaranteed consensus")
    
    print()
    print("⏳ Triggering Human RPC and starting real-time updates...")
    print("🔄 REITERATOR ACTIVE: Will automatically retry if humans reject the answer")
    print("   • Negative consensus triggers automatic retry")
    print("   • Up to 3 attempts with exponential backoff (1s, 2s, 4s...)")
    print("   • Each retry costs an additional 0.4 USDC")
    
    # Prepare context
    context = {
        "type": "ai_verification",
        "summary": f"Verify AI answer from answer_question. Confidence: {confidence:.3f}. MINIMAL VOTERS TEST CASE.",
        "data": {
            "userQuery": ai_result["userQuery"],
            "agentConclusion": ai_result["agentConclusion"],
            "confidence": confidence,
            "reasoning": ai_result["reasoning"],
            "testCase": "minimal_voters_no_consensus" if confidence >= 0.95 else "normal"
        }
    }
    
    try:
        # Call Human RPC - the SDK handles task creation and polling internally
        human_result = agent.ask_human_rpc(
            text=ai_result["userQuery"],
            agentName="QuestionAnswerer-v2",
            reward="0.4 USDC",
            rewardAmount=0.4,
            category="Question Answering",
            escrowAmount="0.8 USDC",
            context=context
        )
        
        if human_result:
            print("\n✅ Human RPC completed successfully!")
            # Combine AI result with human verdict
            combined_result = ai_result.copy()
            combined_result["human_verdict"] = human_result
            return combined_result
        else:
            print("\n❌ Human RPC failed or returned None")
            return ai_result
            
    except Exception as e:
        print(f"\n❌ Human RPC error: {e}")
        return ai_result


def poll_task_progress_continuous(task_id: str, max_duration_minutes: int = 10) -> dict:
    """
    Continuously poll task progress to show real-time voting updates.
    Updates every 2 seconds and shows live voting progress.
    
    Args:
        task_id: The task ID to poll
        max_duration_minutes: Maximum time to poll in minutes
        
    Returns:
        Final task status with voting information
    """
    
    human_rpc_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    task_url = f"{human_rpc_url}/{task_id}"
    
    print("=" * 60)
    print(f"🔄 LIVE VOTING UPDATES - Task: {task_id}")
    print("=" * 60)
    print("   Updates every 2 seconds - Press Ctrl+C to stop")
    print()
    
    start_time = time.time()
    max_duration_seconds = max_duration_minutes * 60
    poll_count = 0
    last_vote_count = -1
    
    try:
        while True:
            poll_count += 1
            elapsed_time = time.time() - start_time
            
            # Check timeout
            if elapsed_time >= max_duration_seconds:
                print(f"⏰ Polling timeout after {max_duration_minutes} minutes")
                break
            
            try:
                response = requests.get(task_url, timeout=10)
                if response.status_code == 200:
                    task_data = response.json()
                    status = task_data.get("status", "unknown")
                    consensus_info = task_data.get("consensus", {})
                    
                    current_votes = consensus_info.get("currentVoteCount", 0)
                    required_votes = consensus_info.get("requiredVoters", 0)
                    yes_votes = consensus_info.get("yesVotes", 0)
                    no_votes = consensus_info.get("noVotes", 0)
                    consensus_threshold = consensus_info.get("consensusThreshold", 0.0)
                    ai_certainty = consensus_info.get("aiCertainty", 0.0)
                    
                    # Clear previous line and show current status
                    print(f"\r🕐 {int(elapsed_time//60):02d}:{int(elapsed_time%60):02d} | ", end="")
                    
                    # Show voting progress
                    progress_pct = (current_votes / required_votes * 100) if required_votes > 0 else 0
                    progress_bar = "█" * int(progress_pct // 5) + "░" * (20 - int(progress_pct // 5))
                    
                    print(f"📊 [{progress_bar}] {current_votes}/{required_votes} votes ({progress_pct:.1f}%)", end="")
                    
                    if yes_votes + no_votes > 0:
                        current_majority = max(yes_votes, no_votes) / (yes_votes + no_votes)
                        majority_leader = "YES" if yes_votes > no_votes else "NO"
                        print(f" | {majority_leader}: {current_majority*100:.1f}%", end="")
                    
                    # Show if new vote came in
                    if current_votes > last_vote_count and last_vote_count >= 0:
                        print(" 🆕 NEW VOTE!", end="")
                    
                    last_vote_count = current_votes
                    
                    # Check if completed
                    if status == "completed":
                        print("\n")
                        print("🎉" * 20)
                        print("🏁 CONSENSUS REACHED!")
                        print("🎉" * 20)
                        
                        result = task_data.get("result", {})
                        if result:
                            decision = result.get("decision", "unknown")
                            consensus_data = result.get("consensus", {})
                            final_majority = consensus_data.get("majorityPercentage", 0) * 100
                            
                            print()
                            print("📋 FINAL RESULTS:")
                            print(f"   🎯 Decision: {decision.upper()}")
                            print(f"   📊 Final Votes: {current_votes}/{required_votes}")
                            print(f"   ✅ Yes Votes: {yes_votes}")
                            print(f"   ❌ No Votes: {no_votes}")
                            print(f"   📈 Final Majority: {final_majority:.1f}%")
                            print(f"   🎯 Required Threshold: {consensus_threshold*100:.1f}%")
                            print(f"   ⏱️  Total Time: {int(elapsed_time//60):02d}:{int(elapsed_time%60):02d}")
                        
                        return task_data
                    
                    # Flush output for real-time display
                    sys.stdout.flush()
                    
                else:
                    print(f"\n⚠️  Poll failed: HTTP {response.status_code}")
                    break
                    
            except requests.exceptions.RequestException as e:
                print(f"\n❌ Network error: {e}")
                print("   Retrying in 5 seconds...")
                time.sleep(5)
                continue
            except Exception as e:
                print(f"\n❌ Poll error: {e}")
                break
            
            # Wait before next poll (2 seconds for real-time feel)
            time.sleep(2)
            
    except KeyboardInterrupt:
        print("\n\n⏹️  Polling stopped by user")
        print(f"   Last known status: {current_votes}/{required_votes} votes")
    
    return {}


def main():
    """Main function to run the normal agent with integrated Human RPC support."""
    print("=" * 60)
    print("Normal Agent (Baseline) - Question Answering Assistant")
    print("Integrated with HumanRPC SDK for automatic Human RPC")
    print("=" * 60)
    print()
    print("This agent uses AI to answer questions, then calls Human RPC")
    print(f"when confidence is below the threshold ({CONFIDENCE_THRESHOLD}).")
    print("The @guard decorator automatically handles the confidence check and Human RPC calls.")
    print()
    print("🧮 Consensus Algorithm Info:")
    print("   • Lower AI confidence → More voters required + Higher consensus threshold")
    print("   • Voters: 3-15 people (always odd number to prevent ties)")
    print("   • Threshold: 51%-90% agreement needed")
    print("   • Multi-phase voting: General → Top 50% → Top 10% if needed")
    print()
    print("🎯 SPECIAL TEST CASE: Minimal Voters with No Consensus")
    print("   • This test is designed to trigger high AI confidence (95%)")
    print("   • Results in minimal voters (N=3) and low threshold (51%)")
    print("   • But voting pattern prevents consensus from being reached")
    print("   • Demonstrates edge case where even minimal requirements fail")
    print()
    print("🔄 REITERATOR FUNCTIONALITY:")
    print("   • Automatic retry enabled when humans reject AI's answer")
    print("   • Will retry up to 3 times with exponential backoff")
    print("   • Continues until positive consensus or max attempts reached")
    print("   • Each retry incurs additional costs (0.4 USDC per attempt)")
    print()

    
    # Test input designed to have HIGH confidence (0.95) to get minimal voters (N=3)
    # but still trigger human verification due to our threshold being 0.96
    test_text = "What is the capital of France?"
    
    print(f"❓ Answering question: \"{test_text}\"")
    print()
    
    try:
        # Step 1: Run AI analysis
        ai_result = answer_question(test_text)
        confidence = ai_result.get("confidence", 1.0)
        
        # Step 2: Check if Human RPC is needed and handle it with real-time polling
        if confidence < CONFIDENCE_THRESHOLD:
            # Show initial reiterator status
            reiterator_status = agent.get_reiterator_status()
            print(f"🔄 Reiterator Status Before Task:")
            print(f"   Session Retries So Far: {reiterator_status.get('total_retries_session', 0)}")
            
            result = handle_human_rpc_with_reiterator_support(ai_result)
            
            # Show final reiterator status
            final_reiterator_status = agent.get_reiterator_status()
            print(f"\n🔄 Reiterator Status After Task:")
            print(f"   Total Session Retries: {final_reiterator_status.get('total_retries_session', 0)}")
            retries_this_task = final_reiterator_status.get('total_retries_session', 0) - reiterator_status.get('total_retries_session', 0)
            print(f"   Retries This Task: {retries_this_task}")
        else:
            result = ai_result
        
        print()
        print("=" * 60)
        print("📋 Final Answer Summary")
        print("=" * 60)
        print(json.dumps(result, indent=2))
        print()
        
        # Check if human verification was triggered
        has_human_verdict = "human_verdict" in result
        has_verification_error = "human_verification_error" in result
        conclusion = result.get("agentConclusion", "UNKNOWN")
        confidence = result.get("confidence", 1.0)
        
        # Show analysis results
        print(f"🤖 AI Answer: {conclusion} (confidence: {confidence:.2f})")
        
        # Show final results
        if confidence < CONFIDENCE_THRESHOLD:
            print("🤖➡️👤 Human RPC was triggered due to confidence below threshold")
            if confidence >= 0.95:
                print("   🎯 SPECIAL CASE: High AI confidence (0.95) but still triggered Human RPC")
                print("   📊 This creates minimal voters (N=3) scenario with potential for no consensus")
        else:
            print("✅ AI was confident enough - no human verification needed")
        
        # Show final results
        has_human_verdict = "human_verdict" in result
        if has_human_verdict:
            human_verdict = result.get("human_verdict", {})
            human_decision = human_verdict.get("decision", "unknown")
            consensus_reached = human_verdict.get("result", {}).get("consensus", "no") == "yes"
            final_votes = human_verdict.get("result", {}).get("finalVotes", {})
            yes_votes = final_votes.get("yes", 0)
            no_votes = final_votes.get("no", 0)
            
            print(f"   👤 Human Voting Results: {yes_votes} YES, {no_votes} NO")
            print(f"   👤 Final human verdict: {human_decision}")
            
            if not consensus_reached:
                print("   ⚠️  NO CONSENSUS REACHED - This demonstrates the minimal voters edge case!")
                print("   📊 Even with minimal voters, consensus can still fail")
                if no_votes > yes_votes:
                    print("   🚫 Majority of humans REJECTED the AI's answer")
        
        print()
        print("📋 FINAL ANSWER:")
        
        # Determine the final answer based on human verdict
        if has_human_verdict:
            human_verdict = result.get("human_verdict", {})
            human_decision = human_verdict.get("decision", "unknown")
            consensus_reached = human_verdict.get("result", {}).get("consensus", "no") == "yes"
            final_votes = human_verdict.get("result", {}).get("finalVotes", {})
            yes_votes = final_votes.get("yes", 0)
            no_votes = final_votes.get("no", 0)
            
            if consensus_reached:
                # Humans reached positive consensus
                final_answer = result.get("agentConclusion", "UNKNOWN")
                print(f"   🎯 Answer: {final_answer}")
                print(f"   ✅ Human Consensus: YES ({yes_votes} accept, {no_votes} reject)")
                print(f"   👤 Status: APPROVED - Humans verified the AI's answer")
            else:
                # No consensus reached
                final_answer = result.get("agentConclusion", "UNKNOWN")
                print(f"   🎯 AI Answer: {final_answer}")
                print(f"   ❌ Human Consensus: NO ({no_votes} reject, {yes_votes} accept)")
                print(f"   ⚠️  Final Status: DISPUTED - No human consensus reached")
        else:
            # No human verification
            final_answer = result.get("agentConclusion", "UNKNOWN")
            print(f"   🎯 Answer: {final_answer}")
        
        final_confidence = result.get("confidence", 1.0)
        print(f"   📊 AI Confidence: {final_confidence:.3f}")
        
        # Show payment information if human verification occurred
        if has_human_verdict:
            print()
            print("💰 Payment Information:")
            print(f"   Reward: 0.4 USDC")
            print(f"   Escrow: 0.8 USDC")
            print(f"   Network: devnet")
            print(f"   Agent: QuestionAnswerer-v2")
            
    except ReiteratorMaxAttemptsError as e:
        print(f"❌ Reiterator Max Attempts Reached: {e}")
        print("   All retry attempts have been exhausted.")
        print("   The humans consistently rejected the AI's answer.")
        reiterator_status = agent.get_reiterator_status()
        print(f"   Total attempts made: {reiterator_status.get('total_retries_session', 0) + 1}")
    except ReiteratorRateLimitError as e:
        print(f"❌ Reiterator Rate Limit Error: {e}")
        print("   Rate limiting encountered during retry attempts.")
    except ReiteratorConfigurationError as e:
        print(f"❌ Reiterator Configuration Error: {e}")
        print("   Check your reiterator configuration parameters.")
    except SDKConfigurationError as e:
        print(f"❌ SDK Configuration Error: {e}")
        print("   Check your SOLANA_PRIVATE_KEY and other configuration.")
    except PaymentError as e:
        print(f"❌ Payment Error: {e}")
        print("   This could be due to insufficient funds in your Solana wallet.")
        print(f"   Wallet address: {agent.wallet.get_public_key()}")
    except HumanVerificationError as e:
        print(f"❌ Human verification failed: {e}")
        print("   This could be due to network issues or Human RPC API problems.")
    except Exception as e:
        print(f"❌ Unexpected error during question answering: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Verify required environment variables
    required_env_vars = ["SOLANA_PRIVATE_KEY", "GOOGLE_API_KEY"]
    missing_vars = [var for var in required_env_vars if not os.getenv(var)]
    
    if missing_vars:
        print("❌ Missing required environment variables:")
        for var in missing_vars:
            print(f"   - {var}")
        print()
        print("Please set these environment variables:")
        print("   export SOLANA_PRIVATE_KEY='your_base58_private_key'")
        print("   export GOOGLE_API_KEY='your_google_api_key'")
        print()
        print("For SOLANA_PRIVATE_KEY, you can generate a devnet wallet at:")
        print("   https://solfaucet.com/")
        sys.exit(1)
    
    # Show configuration
    print("🔧 Agent Configuration:")
    print(f"   Network: {agent.network}")
    print(f"   Agent Name: {agent.default_agent_name}")
    print(f"   Reward: {agent.default_reward}")
    print(f"   Category: {agent.default_category}")
    print(f"   Escrow: {agent.default_escrow_amount}")
    print(f"   Confidence Threshold: {CONFIDENCE_THRESHOLD}")
    print(f"   Wallet: {agent.wallet.get_public_key()}")
    
    # Show reiterator status
    reiterator_status = agent.get_reiterator_status()
    print(f"   🔄 Reiterator: {'Enabled' if reiterator_status['enabled'] else 'Disabled'}")
    if reiterator_status['enabled']:
        print(f"   📊 Max Attempts: {reiterator_status.get('max_attempts', 'N/A')}")
        print(f"   ⏱️  Backoff Strategy: {reiterator_status.get('backoff_strategy', 'N/A')}")
        print(f"   🕐 Base Delay: {reiterator_status.get('base_delay', 'N/A')}s")
    print()
    
    main()

