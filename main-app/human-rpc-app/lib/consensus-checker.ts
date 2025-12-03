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
  
  // Check if we have enough voters
  if (currentVoteCount < requiredVoters) {
    return {
      reached: false,
      decision: null,
      majorityPercentage: 0,
      requiredVoters,
      currentVoteCount,
      consensusThreshold,
      yesVotes,
      noVotes,
    }
  }
  
  // Determine majority and calculate percentage
  const majorityVotes = Math.max(yesVotes, noVotes)
  const majorityPercentage = currentVoteCount > 0 
    ? majorityVotes / currentVoteCount 
    : 0
  
  // Check if majority percentage meets threshold
  const meetsThreshold = majorityPercentage >= consensusThreshold
  
  // Determine winning decision
  let decision: "yes" | "no" | null = null
  if (meetsThreshold) {
    decision = yesVotes > noVotes ? "yes" : "no"
  }
  
  return {
    reached: meetsThreshold,
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
  if (result.reached) {
    return `Consensus reached: ${result.decision?.toUpperCase()} with ${(result.majorityPercentage * 100).toFixed(1)}% agreement`
  }
  
  if (result.currentVoteCount < result.requiredVoters) {
    return `Waiting for more votes: ${result.currentVoteCount}/${result.requiredVoters} voters`
  }
  
  return `No consensus yet: ${(result.majorityPercentage * 100).toFixed(1)}% majority (needs ${(result.consensusThreshold * 100).toFixed(1)}%)`
}

