/**
 * Inverse Confidence Sliding Scale Consensus Algorithm
 * 
 * This algorithm dynamically calculates the number of required voters (N)
 * and consensus threshold (T) based on AI certainty using linear interpolation.
 * 
 * Core Principle: Risk Compensation
 * - High AI Certainty = Low Risk → Optimize for Speed/Cost (fewer people, simple majority)
 * - Low AI Certainty = High Risk → Optimize for Accuracy (more people, super-majority)
 */

// Algorithm bounds
const N_MIN = 3 // Minimum number of voters (safe scenario)
const N_MAX = 15 // Maximum number of voters (risky scenario)
const T_MIN = 0.51 // Minimum consensus threshold (51% - simple majority)
const T_MAX = 0.90 // Maximum consensus threshold (90% - super majority)
const CERTAINTY_MIN = 0.5 // Minimum AI certainty (50% - total guess)
const CERTAINTY_MAX = 1.0 // Maximum AI certainty (100% - completely sure)

/**
 * Calculate the Uncertainty Factor (U)
 * Normalizes AI's confusion into a score between 0.0 and 1.0
 * 
 * @param certainty - AI certainty value (0.5 to 1.0)
 * @returns Uncertainty factor (0.0 to 1.0)
 */
export function calculateUncertaintyFactor(certainty: number): number {
  // Clamp certainty to valid range
  const clampedCertainty = Math.max(CERTAINTY_MIN, Math.min(CERTAINTY_MAX, certainty))
  
  // U = (1.0 - Certainty) / 0.5
  // If AI is 100% sure (1.0), Uncertainty is 0
  // If AI is 50% sure (0.5), Uncertainty is 1
  const uncertainty = (1.0 - clampedCertainty) / (CERTAINTY_MAX - CERTAINTY_MIN)
  
  return Math.max(0, Math.min(1, uncertainty)) // Ensure 0-1 range
}

/**
 * Calculate Required Voters (N)
 * Scales the number of voters linearly based on uncertainty
 * 
 * @param certainty - AI certainty value (0.5 to 1.0)
 * @returns Number of required voters (3 to 15, rounded to nearest odd number)
 */
export function calculateRequiredVoters(certainty: number): number {
  const U = calculateUncertaintyFactor(certainty)
  
  // N = N_min + ceil(U × (N_max - N_min))
  const rawVoters = N_MIN + Math.ceil(U * (N_MAX - N_MIN))
  
  // Round to nearest odd number to prevent ties
  // If even, add 1 to make it odd
  const voters = rawVoters % 2 === 0 ? rawVoters + 1 : rawVoters
  
  // Ensure it's within bounds
  return Math.max(N_MIN, Math.min(N_MAX, voters))
}

/**
 * Calculate Consensus Threshold (T)
 * Scales the agreement threshold based on uncertainty
 * 
 * @param certainty - AI certainty value (0.5 to 1.0)
 * @returns Consensus threshold percentage (0.51 to 0.90)
 */
export function calculateConsensusThreshold(certainty: number): number {
  const U = calculateUncertaintyFactor(certainty)
  
  // T = T_min + (U × (T_max - T_min))
  const threshold = T_MIN + (U * (T_MAX - T_MIN))
  
  // Ensure it's within bounds
  return Math.max(T_MIN, Math.min(T_MAX, threshold))
}

/**
 * Calculate both consensus parameters from AI certainty
 * 
 * @param certainty - AI certainty value (0.5 to 1.0)
 * @returns Object containing requiredVoters and consensusThreshold
 */
export function calculateConsensusParams(certainty: number): {
  requiredVoters: number
  consensusThreshold: number
} {
  const requiredVoters = calculateRequiredVoters(certainty)
  const consensusThreshold = calculateConsensusThreshold(certainty)
  
  return {
    requiredVoters,
    consensusThreshold,
  }
}

/**
 * Example scenarios for reference:
 * 
 * Scenario A: AI Certainty 95% (0.95)
 * - U = 0.1
 * - N = 3 + ceil(0.1 × 12) = 5 voters
 * - T = 0.51 + (0.1 × 0.39) = 0.55 (55%)
 * 
 * Scenario B: AI Certainty 70% (0.70)
 * - U = 0.6
 * - N = 3 + ceil(0.6 × 12) = 11 voters
 * - T = 0.51 + (0.6 × 0.39) = 0.74 (74%)
 * 
 * Scenario C: AI Certainty 50% (0.50)
 * - U = 1.0
 * - N = 3 + ceil(1.0 × 12) = 15 voters
 * - T = 0.51 + (1.0 × 0.39) = 0.90 (90%)
 */

