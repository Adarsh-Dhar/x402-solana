/**
 * Consensus Checking Logic
 * 
 * Determines if a task has reached consensus based on:
 * - Number of votes received (must be >= requiredVoters)
 * - Majority percentage (must be >= consensusThreshold)
 */

export interface ConsensusResult {
  reached: boolean
  decision: "yes" | "no" | null
  majorityPercentage: number
  requiredVoters: number
  currentVoteCount: number
  consensusThreshold: number
  yesVotes: number
  noVotes: number
}

/**
 * Check if consensus has been reached for a task
 * 
 * @param yesVotes - Number of "yes" votes
 * @param noVotes - Number of "no" votes
 * @param requiredVoters - Minimum number of voters needed
 * @param consensusThreshold - Minimum percentage needed for consensus (0.51 to 0.90)
 * @returns ConsensusResult with status and details
 */
export function checkConsensus(
  yesVotes: number,
  noVotes: number,
  requiredVoters: number,
  consensusThreshold: number
): ConsensusResult {
  const currentVoteCount = yesVotes + noVotes
  
  // Calculate minimum votes needed for consensus
  const minVotesForConsensus = Math.ceil(requiredVoters * consensusThreshold)
  
  // Check for early consensus - can we reach consensus before all votes are in?
  let earlyConsensusReached = false
  let decision: "yes" | "no" | null = null
  let majorityPercentage = 0
  
  if (currentVoteCount > 0) {
    // Check if YES votes can reach consensus
    if (yesVotes >= minVotesForConsensus) {
      earlyConsensusReached = true
      decision = "yes"
      // Calculate percentage based on current votes
      majorityPercentage = yesVotes / currentVoteCount
    }
    // Check if NO votes can reach consensus
    else if (noVotes >= minVotesForConsensus) {
      earlyConsensusReached = true
      decision = "no"
      // Calculate percentage based on current votes
      majorityPercentage = noVotes / currentVoteCount
    }
    // Check if it's impossible for either side to reach consensus
    else {
      const remainingVotes = requiredVoters - currentVoteCount
      const maxPossibleYes = yesVotes + remainingVotes
      const maxPossibleNo = noVotes + remainingVotes
      
      // If neither side can possibly reach the minimum votes needed, 
      // we need to wait for all votes and use percentage-based consensus
      if (maxPossibleYes < minVotesForConsensus && maxPossibleNo < minVotesForConsensus) {
        // Fall back to percentage-based consensus only after all votes are in
        if (currentVoteCount >= requiredVoters) {
          const majorityVotes = Math.max(yesVotes, noVotes)
          majorityPercentage = majorityVotes / currentVoteCount
          
          if (majorityPercentage >= consensusThreshold) {
            earlyConsensusReached = true
            decision = yesVotes > noVotes ? "yes" : "no"
          }
        }
      } else {
        // Calculate current majority percentage for display
        const majorityVotes = Math.max(yesVotes, noVotes)
        majorityPercentage = majorityVotes / currentVoteCount
      }
    }
  }
  
  return {
    reached: earlyConsensusReached,
    decision,
    majorityPercentage,
    requiredVoters,
    currentVoteCount,
    consensusThreshold,
    yesVotes,
    noVotes,
  }
}

/**
 * Get consensus status message
 */
export function getConsensusStatusMessage(result: ConsensusResult): string {
  const minVotesForConsensus = Math.ceil(result.requiredVoters * result.consensusThreshold)
  
  if (result.reached) {
    return `Consensus reached: ${result.decision?.toUpperCase()} with ${(result.majorityPercentage * 100).toFixed(1)}% agreement`
  }
  
  if (result.currentVoteCount < result.requiredVoters) {
    const yesNeeded = Math.max(0, minVotesForConsensus - result.yesVotes)
    const noNeeded = Math.max(0, minVotesForConsensus - result.noVotes)
    
    if (yesNeeded === 0) {
      return `YES can win with next ${yesNeeded} votes`
    } else if (noNeeded === 0) {
      return `NO can win with next ${noNeeded} votes`
    } else {
      return `Waiting for votes: ${result.currentVoteCount}/${result.requiredVoters} (need ${Math.min(yesNeeded, noNeeded)} more for consensus)`
    }
  }
  
  return `No consensus: ${(result.majorityPercentage * 100).toFixed(1)}% majority (needs ${(result.consensusThreshold * 100).toFixed(1)}%)`
}

