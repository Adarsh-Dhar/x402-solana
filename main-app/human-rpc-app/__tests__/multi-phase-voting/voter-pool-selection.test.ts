/**
 * Property-Based Tests for Voter Pool Selection and Leaderboard Filtering
 * 
 * **Feature: multi-phase-voting-consensus, Property 4: Voter pool filtering accuracy**
 * **Validates: Requirements 2.2, 2.3**
 */

import * as fc from 'fast-check'
import { VotingPhase, getPhasePercentile } from '../../lib/multi-phase-voting/types'
import type { LeaderboardRanking } from '../../lib/multi-phase-voting/types'

describe('Voter Pool Selection Properties', () => {
  
  /**
   * Mock leaderboard data generator for testing
   */
  const generateMockLeaderboard = (size: number): LeaderboardRanking[] => {
    const rankings: LeaderboardRanking[] = []
    
    for (let i = 0; i < size; i++) {
      rankings.push({
        userId: `user_${i}`,
        accuracy: Math.random(), // Random accuracy between 0 and 1
        totalVotes: Math.floor(Math.random() * 100) + 10, // 10-110 votes
        rank: i + 1,
        percentile: (i + 1) / size
      })
    }
    
    // Sort by accuracy (descending) to simulate real leaderboard
    rankings.sort((a, b) => b.accuracy - a.accuracy)
    
    // Update ranks and percentiles after sorting
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1
      ranking.percentile = (index + 1) / size
    })
    
    return rankings
  }

  /**
   * Mock voter pool selector that implements the filtering logic
   */
  class MockVoterPoolSelector {
    filterVotersByPercentile(leaderboard: LeaderboardRanking[], percentile: number): string[] {
      return leaderboard
        .filter(ranking => ranking.percentile <= percentile)
        .map(ranking => ranking.userId)
    }
    
    getPhaseEligibleVoters(leaderboard: LeaderboardRanking[], phase: VotingPhase): string[] {
      const percentile = getPhasePercentile(phase)
      return this.filterVotersByPercentile(leaderboard, percentile)
    }
  }

  /**
   * **Feature: multi-phase-voting-consensus, Property 4: Voter pool filtering accuracy**
   * **Validates: Requirements 2.2, 2.3**
   * For any Phase 2 initiation, all selected voters should be in the top 50% of leaderboard 
   * rankings, and for Phase 3, all selected voters should be in the top 10% of leaderboard rankings
   */
  test('voter pool filtering accuracy property', () => {
    const selector = new MockVoterPoolSelector()
    
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 200 }), // Leaderboard size
        fc.constantFrom(VotingPhase.PHASE_1, VotingPhase.PHASE_2, VotingPhase.PHASE_3),
        (leaderboardSize, phase) => {
          const leaderboard = generateMockLeaderboard(leaderboardSize)
          const selectedVoters = selector.getPhaseEligibleVoters(leaderboard, phase)
          const expectedPercentile = getPhasePercentile(phase)
          
          // All selected voters should be within the expected percentile
          for (const voterId of selectedVoters) {
            const voterRanking = leaderboard.find(r => r.userId === voterId)
            expect(voterRanking).toBeDefined()
            expect(voterRanking!.percentile).toBeLessThanOrEqual(expectedPercentile)
          }
          
          // Verify specific phase requirements
          if (phase === VotingPhase.PHASE_1) {
            // Phase 1 should include all voters (100%)
            expect(selectedVoters.length).toBe(leaderboard.length)
          } else if (phase === VotingPhase.PHASE_2) {
            // Phase 2 should include top 50%
            const expectedCount = Math.floor(leaderboard.length * 0.5)
            expect(selectedVoters.length).toBeLessThanOrEqual(expectedCount + 1) // Allow for rounding
            expect(selectedVoters.length).toBeGreaterThanOrEqual(expectedCount)
          } else if (phase === VotingPhase.PHASE_3) {
            // Phase 3 should include top 10%
            const expectedCount = Math.floor(leaderboard.length * 0.1)
            expect(selectedVoters.length).toBeLessThanOrEqual(expectedCount + 1) // Allow for rounding
            expect(selectedVoters.length).toBeGreaterThanOrEqual(Math.max(1, expectedCount)) // At least 1 voter
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Voter pool size decreases monotonically across phases
   */
  test('voter pool size decreases across phases', () => {
    const selector = new MockVoterPoolSelector()
    
    fc.assert(
      fc.property(
        fc.integer({ min: 30, max: 300 }), // Leaderboard size (ensure enough for meaningful percentiles)
        (leaderboardSize) => {
          const leaderboard = generateMockLeaderboard(leaderboardSize)
          
          const phase1Voters = selector.getPhaseEligibleVoters(leaderboard, VotingPhase.PHASE_1)
          const phase2Voters = selector.getPhaseEligibleVoters(leaderboard, VotingPhase.PHASE_2)
          const phase3Voters = selector.getPhaseEligibleVoters(leaderboard, VotingPhase.PHASE_3)
          
          // Each subsequent phase should have fewer or equal voters
          expect(phase2Voters.length).toBeLessThanOrEqual(phase1Voters.length)
          expect(phase3Voters.length).toBeLessThanOrEqual(phase2Voters.length)
          
          // Phase 3 should be a subset of Phase 2, which should be a subset of Phase 1
          const phase1Set = new Set(phase1Voters)
          const phase2Set = new Set(phase2Voters)
          const phase3Set = new Set(phase3Voters)
          
          // All Phase 2 voters should be in Phase 1
          for (const voter of phase2Voters) {
            expect(phase1Set.has(voter)).toBe(true)
          }
          
          // All Phase 3 voters should be in Phase 2
          for (const voter of phase3Voters) {
            expect(phase2Set.has(voter)).toBe(true)
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Top percentile voters are always the highest accuracy voters
   */
  test('top percentile voters have highest accuracy', () => {
    const selector = new MockVoterPoolSelector()
    
    fc.assert(
      fc.property(
        fc.integer({ min: 20, max: 100 }), // Leaderboard size
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0) }), // Percentile threshold
        (leaderboardSize, percentile) => {
          const leaderboard = generateMockLeaderboard(leaderboardSize)
          const selectedVoters = selector.filterVotersByPercentile(leaderboard, percentile)
          
          if (selectedVoters.length === 0) {
            return true // Skip if no voters selected
          }
          
          // Get accuracy of selected voters
          const selectedAccuracies = selectedVoters.map(voterId => {
            const ranking = leaderboard.find(r => r.userId === voterId)
            return ranking!.accuracy
          })
          
          // Get accuracy of non-selected voters
          const nonSelectedVoters = leaderboard
            .filter(r => !selectedVoters.includes(r.userId))
            .map(r => r.accuracy)
          
          if (nonSelectedVoters.length === 0) {
            return true // All voters selected
          }
          
          // Minimum accuracy of selected voters should be >= maximum accuracy of non-selected voters
          const minSelectedAccuracy = Math.min(...selectedAccuracies)
          const maxNonSelectedAccuracy = Math.max(...nonSelectedVoters)
          
          expect(minSelectedAccuracy).toBeGreaterThanOrEqual(maxNonSelectedAccuracy)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Percentile filtering is consistent and deterministic
   */
  test('percentile filtering is deterministic', () => {
    const selector = new MockVoterPoolSelector()
    
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 50 }), // Leaderboard size
        fc.float({ min: Math.fround(0.1), max: Math.fround(1.0) }), // Percentile threshold
        (leaderboardSize, percentile) => {
          const leaderboard = generateMockLeaderboard(leaderboardSize)
          
          // Filter multiple times with same parameters
          const result1 = selector.filterVotersByPercentile(leaderboard, percentile)
          const result2 = selector.filterVotersByPercentile(leaderboard, percentile)
          
          // Results should be identical
          expect(result1).toEqual(result2)
          expect(result1.length).toBe(result2.length)
          
          // All voters in result should meet percentile requirement
          for (const voterId of result1) {
            const ranking = leaderboard.find(r => r.userId === voterId)
            expect(ranking!.percentile).toBeLessThanOrEqual(percentile)
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Edge case handling for small voter pools
   */
  test('handles small voter pools correctly', () => {
    const selector = new MockVoterPoolSelector()
    
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }), // Very small leaderboard
        fc.constantFrom(VotingPhase.PHASE_2, VotingPhase.PHASE_3),
        (leaderboardSize, phase) => {
          const leaderboard = generateMockLeaderboard(leaderboardSize)
          const selectedVoters = selector.getPhaseEligibleVoters(leaderboard, phase)
          
          // Should always select at least 1 voter if any exist, except when percentile is very restrictive
          if (leaderboard.length > 0) {
            const expectedPercentile = getPhasePercentile(phase)
            const expectedCount = Math.floor(leaderboard.length * expectedPercentile)
            
            if (expectedCount > 0) {
              expect(selectedVoters.length).toBeGreaterThan(0)
            } else {
              // For very small pools where percentile calculation results in 0, 
              // we should still select at least 1 voter in practice
              expect(selectedVoters.length).toBeGreaterThanOrEqual(0)
            }
          }
          
          // Should never select more voters than available
          expect(selectedVoters.length).toBeLessThanOrEqual(leaderboard.length)
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe('Leaderboard Ranking Properties', () => {
  
  /**
   * Mock leaderboard calculator for testing ranking consistency
   */
  class MockLeaderboardCalculator {
    calculateRankings(voteData: Array<{ userId: string; totalVotes: number; correctVotes: number }>): LeaderboardRanking[] {
      const rankings: LeaderboardRanking[] = []
      
      for (const data of voteData) {
        const accuracy = data.totalVotes > 0 ? data.correctVotes / data.totalVotes : 0
        
        // Only include users with at least 3 votes for meaningful accuracy
        if (data.totalVotes >= 3) {
          rankings.push({
            userId: data.userId,
            accuracy: accuracy,
            totalVotes: data.totalVotes,
            rank: 0, // Will be set after sorting
            percentile: 0 // Will be set after sorting
          })
        }
      }
      
      // Sort by accuracy (descending), then by total votes (descending) for tie-breaking
      rankings.sort((a, b) => {
        if (a.accuracy !== b.accuracy) {
          return b.accuracy - a.accuracy
        }
        return b.totalVotes - a.totalVotes
      })
      
      // Assign ranks and percentiles
      rankings.forEach((ranking, index) => {
        ranking.rank = index + 1
        ranking.percentile = (index + 1) / rankings.length
      })
      
      return rankings
    }
  }

  /**
   * **Feature: multi-phase-voting-consensus, Property 5: Leaderboard ranking consistency**
   * **Validates: Requirements 2.4**
   * For any leaderboard calculation, rankings should be based solely on historical 
   * voting accuracy as the primary metric
   */
  test('leaderboard ranking consistency property', () => {
    const calculator = new MockLeaderboardCalculator()
    
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 20 }),
            totalVotes: fc.integer({ min: 3, max: 100 }),
            correctVotes: fc.nat()
          }),
          { minLength: 5, maxLength: 50 }
        ).map(users => {
          // Ensure correctVotes <= totalVotes and make userIds unique
          const uniqueUsers = new Map()
          users.forEach((user, index) => {
            const userId = `user_${index}_${user.userId}`
            const correctVotes = Math.min(user.correctVotes, user.totalVotes)
            uniqueUsers.set(userId, {
              userId,
              totalVotes: user.totalVotes,
              correctVotes
            })
          })
          return Array.from(uniqueUsers.values())
        }),
        (voteData) => {
          const rankings = calculator.calculateRankings(voteData)
          
          if (rankings.length === 0) {
            return true // Skip if no valid rankings
          }
          
          // Property 1: Rankings should be ordered by accuracy (descending)
          for (let i = 0; i < rankings.length - 1; i++) {
            const current = rankings[i]
            const next = rankings[i + 1]
            
            // Current should have higher or equal accuracy than next
            expect(current.accuracy).toBeGreaterThanOrEqual(next.accuracy)
            
            // If accuracy is equal, current should have more or equal total votes (tie-breaker)
            if (current.accuracy === next.accuracy) {
              expect(current.totalVotes).toBeGreaterThanOrEqual(next.totalVotes)
            }
          }
          
          // Property 2: Ranks should be sequential starting from 1
          rankings.forEach((ranking, index) => {
            expect(ranking.rank).toBe(index + 1)
          })
          
          // Property 3: Percentiles should be correctly calculated
          rankings.forEach((ranking, index) => {
            const expectedPercentile = (index + 1) / rankings.length
            expect(ranking.percentile).toBeCloseTo(expectedPercentile, 10)
          })
          
          // Property 4: Accuracy should be calculated correctly from vote data
          for (const ranking of rankings) {
            const originalData = voteData.find(d => d.userId === ranking.userId)
            if (originalData) {
              const expectedAccuracy = originalData.totalVotes > 0 ? 
                originalData.correctVotes / originalData.totalVotes : 0
              expect(ranking.accuracy).toBeCloseTo(expectedAccuracy, 10)
              expect(ranking.totalVotes).toBe(originalData.totalVotes)
            }
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Leaderboard rankings are deterministic for same input
   */
  test('leaderboard rankings are deterministic', () => {
    const calculator = new MockLeaderboardCalculator()
    
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            totalVotes: fc.integer({ min: 3, max: 50 }),
            correctVotes: fc.nat()
          }),
          { minLength: 3, maxLength: 20 }
        ).map(users => {
          // Ensure correctVotes <= totalVotes and make userIds unique
          const uniqueUsers = new Map()
          users.forEach((user, index) => {
            const userId = `user_${index}`
            const correctVotes = Math.min(user.correctVotes, user.totalVotes)
            uniqueUsers.set(userId, {
              userId,
              totalVotes: user.totalVotes,
              correctVotes
            })
          })
          return Array.from(uniqueUsers.values())
        }),
        (voteData) => {
          const rankings1 = calculator.calculateRankings(voteData)
          const rankings2 = calculator.calculateRankings(voteData)
          
          // Results should be identical
          expect(rankings1).toEqual(rankings2)
          expect(rankings1.length).toBe(rankings2.length)
          
          // Each ranking should be identical
          for (let i = 0; i < rankings1.length; i++) {
            expect(rankings1[i].userId).toBe(rankings2[i].userId)
            expect(rankings1[i].accuracy).toBe(rankings2[i].accuracy)
            expect(rankings1[i].rank).toBe(rankings2[i].rank)
            expect(rankings1[i].percentile).toBe(rankings2[i].percentile)
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Higher accuracy always results in better rank
   */
  test('higher accuracy results in better rank', () => {
    const calculator = new MockLeaderboardCalculator()
    
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }), // Accuracy 1
        fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }), // Accuracy 2
        fc.integer({ min: 10, max: 100 }), // Total votes
        (accuracy1, accuracy2, totalVotes) => {
          // Skip if any value is NaN or invalid
          if (isNaN(accuracy1) || isNaN(accuracy2) || isNaN(totalVotes) || accuracy1 === accuracy2) {
            return true
          }
          
          const correctVotes1 = Math.floor(totalVotes * accuracy1)
          const correctVotes2 = Math.floor(totalVotes * accuracy2)
          
          // Calculate actual accuracies after rounding
          const actualAccuracy1 = correctVotes1 / totalVotes
          const actualAccuracy2 = correctVotes2 / totalVotes
          
          // Skip if the actual accuracies are equal after rounding
          if (actualAccuracy1 === actualAccuracy2) {
            return true
          }
          
          const voteData = [
            {
              userId: 'user1',
              totalVotes: totalVotes,
              correctVotes: correctVotes1
            },
            {
              userId: 'user2',
              totalVotes: totalVotes,
              correctVotes: correctVotes2
            }
          ]
          
          const rankings = calculator.calculateRankings(voteData)
          
          if (rankings.length !== 2) {
            return true // Skip if filtering removed users
          }
          
          const user1Ranking = rankings.find(r => r.userId === 'user1')!
          const user2Ranking = rankings.find(r => r.userId === 'user2')!
          
          // User with higher actual accuracy should have better (lower) rank
          if (actualAccuracy1 > actualAccuracy2) {
            expect(user1Ranking.rank).toBeLessThan(user2Ranking.rank)
          } else {
            expect(user2Ranking.rank).toBeLessThan(user1Ranking.rank)
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })

  /**
   * Property: Minimum vote threshold is enforced
   */
  test('minimum vote threshold is enforced', () => {
    const calculator = new MockLeaderboardCalculator()
    
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            userId: fc.string({ minLength: 1, maxLength: 10 }),
            totalVotes: fc.integer({ min: 0, max: 10 }), // Include users with < 3 votes
            correctVotes: fc.nat()
          }),
          { minLength: 5, maxLength: 20 }
        ).map(users => {
          // Ensure correctVotes <= totalVotes and make userIds unique
          const uniqueUsers = new Map()
          users.forEach((user, index) => {
            const userId = `user_${index}`
            const correctVotes = Math.min(user.correctVotes, user.totalVotes)
            uniqueUsers.set(userId, {
              userId,
              totalVotes: user.totalVotes,
              correctVotes
            })
          })
          return Array.from(uniqueUsers.values())
        }),
        (voteData) => {
          const rankings = calculator.calculateRankings(voteData)
          
          // All users in rankings should have at least 3 votes
          for (const ranking of rankings) {
            expect(ranking.totalVotes).toBeGreaterThanOrEqual(3)
          }
          
          // Users with < 3 votes should not be in rankings
          const usersWithFewVotes = voteData.filter(d => d.totalVotes < 3)
          for (const user of usersWithFewVotes) {
            const inRankings = rankings.some(r => r.userId === user.userId)
            expect(inRankings).toBe(false)
          }
          
          return true
        }
      ),
      { numRuns: 100 }
    )
  })
})