/**
 * Property-Based Tests for Consensus Threshold Consistency
 * 
 * **Feature: multi-phase-voting-consensus, Property 8: Consensus threshold consistency**
 * **Validates: Requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5**
 */

import * as fc from 'fast-check'
import { 
  checkConsensus, 
  checkMultiPhaseConsensus, 
  validateConsensusThresholdConsistency,
  getConsensusStatusMessage,
  getMultiPhaseStatusMessage
} from '../../lib/consensus-checker'
import { VotingPhase } from '../../lib/multi-phase-voting/types'

describe('Consensus Threshold Consistency Properties', () => {
  
  /**
   * **Feature: multi-phase-voting-consensus, Property 8: Consensus threshold consistency**
   * **Validates: Requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5**
   * For any multi-phase voting process, the consensus threshold and calculation methods 
   * should remain identical across all phases
   */
  test('consensus threshold consistency across phases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 20 }), // Required voters
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.90) }), // Consensus threshold
        fc.integer({ min: 0, max: 20 }), // Yes votes
        fc.integer({ min: 0, max: 20 }), // No votes
        (requiredVoters, consensusThreshold, yesVotes, noVotes) => {
          // Ensure vote counts don't exceed required voters
          const actualYesVotes = Math.min(yesVotes, requiredVoters)
          const actualNoVotes = Math.min(noVotes, requiredVoters - actualYesVotes)
          
          // Check consensus for each phase with identical parameters
          const phase1Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_1
          )
          const phase2Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_2
          )
          const phase3Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_3
          )
          
          // All phases should have identical consensus results (except phase-specific metadata)
          expect(phase1Result.reached).toBe(phase2Result.reached)
          expect(phase2Result.reached).toBe(phase3Result.reached)
          
          expect(phase1Result.decision).toBe(phase2Result.decision)
          expect(phase2Result.decision).toBe(phase3Result.decision)
          
          expect(phase1Result.majorityPercentage).toBeCloseTo(phase2Result.majorityPercentage, 10)
          expect(phase2Result.majorityPercentage).toBeCloseTo(phase3Result.majorityPercentage, 10)
          
          expect(phase1Result.consensusThreshold).toBe(phase2Result.consensusThreshold)
          expect(phase2Result.consensusThreshold).toBe(phase3Result.consensusThreshold)
          
          expect(phase1Result.yesVotes).toBe(phase2Result.yesVotes)
          expect(phase2Result.yesVotes).toBe(phase3Result.yesVotes)
          
          expect(phase1Result.noVotes).toBe(phase2Result.noVotes)
          expect(phase2Result.noVotes).toBe(phase3Result.noVotes)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Multi-phase consensus produces same results as single-phase consensus
   */
  test('multi-phase consensus matches single-phase consensus logic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 50 }), // Required voters
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.90) }), // Consensus threshold
        fc.integer({ min: 0, max: 50 }), // Yes votes
        fc.integer({ min: 0, max: 50 }), // No votes
        fc.constantFrom(VotingPhase.PHASE_1, VotingPhase.PHASE_2, VotingPhase.PHASE_3),
        (requiredVoters, consensusThreshold, yesVotes, noVotes, phase) => {
          // Ensure vote counts don't exceed required voters
          const actualYesVotes = Math.min(yesVotes, requiredVoters)
          const actualNoVotes = Math.min(noVotes, requiredVoters - actualYesVotes)
          
          // Check consensus using both methods
          const singlePhaseResult = checkConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold
          )
          const multiPhaseResult = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, phase
          )
          
          // Core consensus logic should be identical
          expect(multiPhaseResult.reached).toBe(singlePhaseResult.reached)
          expect(multiPhaseResult.decision).toBe(singlePhaseResult.decision)
          expect(multiPhaseResult.majorityPercentage).toBeCloseTo(singlePhaseResult.majorityPercentage, 10)
          expect(multiPhaseResult.consensusThreshold).toBe(singlePhaseResult.consensusThreshold)
          expect(multiPhaseResult.yesVotes).toBe(singlePhaseResult.yesVotes)
          expect(multiPhaseResult.noVotes).toBe(singlePhaseResult.noVotes)
          expect(multiPhaseResult.currentVoteCount).toBe(singlePhaseResult.currentVoteCount)
          expect(multiPhaseResult.requiredVoters).toBe(singlePhaseResult.requiredVoters)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Consensus threshold validation works correctly
   */
  test('consensus threshold validation property', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }), // Threshold 1
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }), // Threshold 2
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }), // Threshold 3
        (threshold1, threshold2, threshold3) => {
          const isValid = validateConsensusThresholdConsistency(threshold1, threshold2, threshold3)
          
          // Should be valid only if all thresholds are equal and within valid range
          const allEqual = threshold1 === threshold2 && threshold2 === threshold3
          const inValidRange = threshold1 >= 0.51 && threshold1 <= 0.90
          const expectedValid = allEqual && inValidRange
          
          expect(isValid).toBe(expectedValid)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Consensus calculation is deterministic
   */
  test('consensus calculation is deterministic', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 30 }), // Required voters
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.90) }), // Consensus threshold
        fc.integer({ min: 0, max: 30 }), // Yes votes
        fc.integer({ min: 0, max: 30 }), // No votes
        fc.constantFrom(VotingPhase.PHASE_1, VotingPhase.PHASE_2, VotingPhase.PHASE_3),
        (requiredVoters, consensusThreshold, yesVotes, noVotes, phase) => {
          // Ensure vote counts don't exceed required voters
          const actualYesVotes = Math.min(yesVotes, requiredVoters)
          const actualNoVotes = Math.min(noVotes, requiredVoters - actualYesVotes)
          
          // Check consensus multiple times with same parameters
          const result1 = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, phase
          )
          const result2 = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, phase
          )
          
          // Results should be identical
          expect(result1).toEqual(result2)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Status messages are consistent across phases
   */
  test('status messages are consistent across phases', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 15 }), // Required voters
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.90) }), // Consensus threshold
        fc.integer({ min: 0, max: 15 }), // Yes votes
        fc.integer({ min: 0, max: 15 }), // No votes
        (requiredVoters, consensusThreshold, yesVotes, noVotes) => {
          // Ensure vote counts don't exceed required voters
          const actualYesVotes = Math.min(yesVotes, requiredVoters)
          const actualNoVotes = Math.min(noVotes, requiredVoters - actualYesVotes)
          
          // Get results for all phases
          const phase1Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_1
          )
          const phase2Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_2
          )
          const phase3Result = checkMultiPhaseConsensus(
            actualYesVotes, actualNoVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_3
          )
          
          // Get status messages
          const message1 = getMultiPhaseStatusMessage(phase1Result)
          const message2 = getMultiPhaseStatusMessage(phase2Result)
          const message3 = getMultiPhaseStatusMessage(phase3Result)
          
          // All messages should contain phase information
          expect(message1.includes("Phase 1") || message1.includes("General Voting")).toBe(true)
          expect(message2.includes("Phase 2") || message2.includes("50%")).toBe(true)
          expect(message3.includes("Phase 3") || message3.includes("10%")).toBe(true)
          
          // If consensus is reached, all messages should indicate consensus
          if (phase1Result.reached) {
            expect(message1).toContain("Consensus reached")
            expect(message2).toContain("Consensus reached")
            expect(message3).toContain("Consensus reached")
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Consensus threshold bounds are enforced
   */
  test('consensus threshold bounds are enforced', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.90) }), // Valid threshold
        (validThreshold) => {
          // Skip if threshold is NaN or at the boundary due to floating point precision
          if (isNaN(validThreshold) || validThreshold < 0.51 || validThreshold > 0.90) {
            return true
          }
          
          // Valid thresholds should pass validation
          expect(validateConsensusThresholdConsistency(validThreshold, validThreshold, validThreshold)).toBe(true)
          
          // Invalid thresholds should fail validation
          const tooLow = Math.fround(0.50)
          const tooHigh = Math.fround(0.91)
          
          expect(validateConsensusThresholdConsistency(tooLow, tooLow, tooLow)).toBe(false)
          expect(validateConsensusThresholdConsistency(tooHigh, tooHigh, tooHigh)).toBe(false)
          
          // Inconsistent thresholds should fail validation
          expect(validateConsensusThresholdConsistency(validThreshold, tooLow, validThreshold)).toBe(false)
          expect(validateConsensusThresholdConsistency(validThreshold, validThreshold, tooHigh)).toBe(false)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Early consensus detection is consistent across phases
   */
  test('early consensus detection is consistent', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }), // Required voters (larger pool for early consensus)
        fc.float({ min: Math.fround(0.51), max: Math.fround(0.80) }), // Consensus threshold
        (requiredVoters, consensusThreshold) => {
          // Skip if consensusThreshold is NaN or invalid
          if (isNaN(consensusThreshold) || consensusThreshold < 0.51 || consensusThreshold > 0.90) {
            return true
          }
          
          // Create scenario where early consensus is possible
          const minVotesForConsensus = Math.ceil(requiredVoters * consensusThreshold)
          const yesVotes = minVotesForConsensus
          const noVotes = 0
          
          // Check all phases
          const phase1Result = checkMultiPhaseConsensus(
            yesVotes, noVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_1
          )
          const phase2Result = checkMultiPhaseConsensus(
            yesVotes, noVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_2
          )
          const phase3Result = checkMultiPhaseConsensus(
            yesVotes, noVotes, requiredVoters, consensusThreshold, VotingPhase.PHASE_3
          )
          
          // All phases should detect early consensus
          expect(phase1Result.reached).toBe(true)
          expect(phase2Result.reached).toBe(true)
          expect(phase3Result.reached).toBe(true)
          
          // All should have same decision
          expect(phase1Result.decision).toBe("yes")
          expect(phase2Result.decision).toBe("yes")
          expect(phase3Result.decision).toBe("yes")
          
          // None should require transition since consensus is reached
          expect(phase1Result.shouldTransition).toBe(false)
          expect(phase2Result.shouldTransition).toBe(false)
          expect(phase3Result.shouldTransition).toBe(false)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})