#!/usr/bin/env python3
"""
Real-Time Normal Agent - Shows live voting updates immediately when Human RPC is triggered.
This version starts polling immediately after task creation, not waiting for SDK completion.
"""

import json
import os
import sys
import time
import requests
import threading
from dotenv import load_dotenv
import google.generativeai as genai

# Add SDK to path for importing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'main-app', 'sdk', 'src'))
from human_rpc_sdk import AutoAgent, HumanVerificationError, SDKConfigurationError, PaymentError

# Load environment variables
load_dotenv()

def calculate_consensus_params(ai_certainty: float) -> dict:
    """Calculate consensus parameters using the same algorithm as the Human RPC API."""
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

# Initialize HumanRPC SDK
agent = AutoAgent(
    network="devnet",
    timeout=30,
    default_agent_name="SarcasmDetector-v1",
    default_reward="0.4 USDC",
    default_reward_amount=0.4,
    default_category="Sarcasm Detection",
    default_escrow_amount="0.8 USDC"
)

# Confidence threshold for triggering Human RPC
CONFIDENCE_THRESHOLD = 0.80

def analyze_text_simple(text: str) -> dict:
    """Simple AI analysis without the @guard decorator so we can handle Human RPC manually."""
    # Get Google API key
    google_api_key = os.getenv("GOOGLE_API_KEY")
    
    if not google_api_key:
        raise ValueError("Google API key not configured. Set GOOGLE_API_KEY in your environment.")
    
    # Configure Gemini
    genai.configure(api_key=google_api_key)
    
    # Build system prompt
    system_prompt = """You are an expert at analyzing crypto-twitter slang and detecting sentiment.
Analyze the given text and determine if it's POSITIVE or NEGATIVE sentiment.
Pay special attention to sarcasm, irony, and crypto-twitter slang terms.

IMPORTANT: Be conservative with confidence scores. If the text is ambiguous, unclear, or could be interpreted multiple ways, use a confidence score below 0.8. Only use high confidence (0.9+) for very clear, unambiguous sentiment.

Return ONLY valid JSON in this exact format:
{
  "sentiment": "POSITIVE" or "NEGATIVE",
  "confidence": 0.0-1.0,
  "reasoning": "A brief explanation of why you reached this conclusion, including any indicators of sarcasm, irony, or slang that influenced your decision"
}"""
    
    # Build a single prompt string using system prompt + user message
    prompt = f"{system_prompt}\n\nUSER: Analyze this text: {text}"
    
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
            if 'sentiment' not in result or 'confidence' not in result or 'reasoning' not in result:
                raise ValueError(f"Invalid response structure: {result}")
            
            # Return new structure with all 4 required fields
            return {
                "userQuery": text,
                "agentConclusion": result['sentiment'],
                "confidence": float(result['confidence']),
                "reasoning": result['reasoning']
            }
        else:
            raise ValueError(f"Could not parse JSON from response: {response_text}")
            
    except Exception as e:
        print(f"⚠️  Error in Gemini API call: {e}")
        raise ValueError(f"Failed to analyze text: {e}")

def poll_task_realtime(task_id: str, stop_event: threading.Event):
    """Poll task in real-time and display updates."""
    human_rpc_url = os.getenv("HUMAN_RPC_URL", "http://localhost:3000/api/v1/tasks")
    task_url = f"{human_rpc_url}/{task_id}"
    
    print("=" * 60)
    print(f"🔄 LIVE VOTING UPDATES - Task: {task_id}")
    print("=" * 60)
    print("   Updates every 2 seconds - Task will complete automatically")
    print()
    
    start_time = time.time()
    poll_count = 0
    last_vote_count = -1
    
    while not stop_event.is_set():
        poll_count += 1
        elapsed_time = time.time() - start_time
        
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
                    
                    stop_event.set()
                    return task_data
                
                # Flush output for real-time display
                sys.stdout.flush()
                
            else:
                print(f"\n⚠️  Poll failed: HTTP {response.status_code}")
                break
                
        except requests.exceptions.RequestException as e:
            print(f"\n❌ Network error: {e}")
            time.sleep(5)
            continue
        except Exception as e:
            print(f"\n❌ Poll error: {e}")
            break
        
        # Wait before next poll (2 seconds for real-time feel)
        time.sleep(2)
    
    return {}

def main():
    """Main function with immediate real-time polling."""
    print("=" * 60)
    print("Real-Time Normal Agent - Live Voting Updates")
    print("=" * 60)
    print()
    print("This agent shows live voting updates immediately when Human RPC is triggered.")
    print(f"Confidence threshold: {CONFIDENCE_THRESHOLD}")
    print()
    
    # Test input
    test_text = "Not sure about this one."
    
    print(f"📝 Analyzing text: \"{test_text}\"")
    print()
    
    try:
        # Step 1: Run AI analysis
        ai_result = analyze_text_simple(test_text)
        confidence = ai_result.get("confidence", 1.0)
        conclusion = ai_result.get("agentConclusion", "UNKNOWN")
        
        print(f"🤖 AI Analysis: {conclusion} (confidence: {confidence:.3f})")
        
        # Step 2: Check if Human RPC is needed
        if confidence < CONFIDENCE_THRESHOLD:
            # Show consensus parameters
            consensus_params = calculate_consensus_params(confidence)
            print()
            print("🧮 THIS AGENT'S VOTING REQUIREMENTS:")
            print(f"   🎯 AI Confidence: {confidence:.3f}")
            print(f"   👥 Required Voters: {consensus_params['requiredVoters']}")
            print(f"   📊 Consensus Threshold: {consensus_params['consensusThreshold'] * 100:.1f}%")
            print(f"   🎲 Minimum Votes Needed: {int(consensus_params['requiredVoters'] * consensus_params['consensusThreshold']) + 1}")
            print()
            print("⏳ Triggering Human RPC...")
            
            # Step 3: Call Human RPC
            context = {
                "type": "ai_verification",
                "summary": f"Verify AI analysis from analyze_text. Confidence: {confidence:.3f}",
                "data": {
                    "userQuery": ai_result["userQuery"],
                    "agentConclusion": ai_result["agentConclusion"],
                    "confidence": confidence,
                    "reasoning": ai_result["reasoning"]
                }
            }
            
            # Start Human RPC call in background
            def call_human_rpc():
                try:
                    return agent.ask_human_rpc(
                        text=ai_result["userQuery"],
                        agentName="SarcasmDetector-v1",
                        reward="0.4 USDC",
                        rewardAmount=0.4,
                        category="Sarcasm Detection",
                        escrowAmount="0.8 USDC",
                        context=context
                    )
                except Exception as e:
                    print(f"\n❌ Human RPC error: {e}")
                    return None
            
            # Start Human RPC in background thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(call_human_rpc)
                
                # Give it a moment to create the task
                time.sleep(3)
                
                # Try to extract task ID from recent tasks
                try:
                    response = requests.get("http://localhost:3000/api/v1/tasks", timeout=10)
                    if response.status_code == 200:
                        tasks = response.json()
                        if tasks and len(tasks) > 0:
                            # Get the most recent task
                            latest_task = tasks[0]
                            task_id = latest_task.get("taskId")
                            
                            if task_id:
                                print(f"📋 Task created: {task_id}")
                                print("🚀 Starting real-time voting updates...")
                                print()
                                
                                # Start real-time polling
                                stop_event = threading.Event()
                                poll_thread = threading.Thread(
                                    target=poll_task_realtime,
                                    args=(task_id, stop_event)
                                )
                                poll_thread.start()
                                
                                # Wait for either polling to complete or Human RPC to finish
                                try:
                                    human_result = future.result(timeout=900)  # 15 minutes max
                                    stop_event.set()
                                    poll_thread.join(timeout=5)
                                    
                                    if human_result:
                                        print("\n✅ Human RPC completed successfully!")
                                        print(f"   Decision: {human_result.get('decision', 'unknown')}")
                                    
                                except concurrent.futures.TimeoutError:
                                    print("\n⏰ Human RPC timeout - but polling continues...")
                                    stop_event.set()
                                    poll_thread.join(timeout=5)
                                
                            else:
                                print("⚠️  Could not extract task ID - falling back to SDK polling")
                                human_result = future.result()
                                
                except Exception as e:
                    print(f"⚠️  Could not start real-time polling: {e}")
                    print("   Falling back to SDK polling...")
                    human_result = future.result()
        else:
            print("✅ AI was confident enough - no human verification needed")
            
    except Exception as e:
        print(f"❌ Error: {e}")
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
        sys.exit(1)
    
    # Show configuration
    print("🔧 Agent Configuration:")
    print(f"   Network: {agent.network}")
    print(f"   Agent Name: {agent.default_agent_name}")
    print(f"   Reward: {agent.default_reward}")
    print(f"   Confidence Threshold: {CONFIDENCE_THRESHOLD}")
    print(f"   Wallet: {agent.wallet.get_public_key()}")
    print()
    
    main()