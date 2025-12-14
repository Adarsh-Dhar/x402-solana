/**
 * Voter Pool Selector Implementation
 * 
 * Determines eligible voters for each phase based on leaderboard rankings and percentile filtering.
 * Integrates with existing voter selection algorithm for Phase 1 and handles edge cases for 
 * insufficient voters in advanced phases.
 */

import { prisma } from "@/lib/prisma"
import { leaderboardCalculator } from "./leaderboard-calculator"
import type { 
  VoterPoolSelector as IVoterPoolSelector,
  VoterPool,
  LeaderboardRanking,
  VotingPhase
} from "./types"
import { getPhasePercentile, getPhaseDescription } from "./types"

export class VoterPoolSelector implements IVoterPoolSelector {

  /**
   * Get eligible voters for a specific phase with percentile filtering
   */
  async getPhaseEligibleVoters(phase: VotingPhase, requiredCount: number): Promise<VoterPool> {
    try {
      console.log(`[VoterPoolSelector] Getting eligible voters for ${getPhaseDescription(phase)}, required: ${requiredCount}`)
      
      const percentile = getPhasePercentile(phase)
      
      if (phase === 1) {
        // Phase 1 uses existing voter selection algorithm
        return await this.getPhase1Voters(requiredCount)
      } else {
        // Phase 2 and 3 use leaderboard-based filtering
        return await this.getLeaderboardFilteredVoters(phase, percentile, requiredCount)
      }

    } catch (error) {
      console.error(`[VoterPoolSelector] Error getting eligible voters for phase ${phase}:`, error)
      throw error
    }
  }

  /**
   * Calculate leaderboard rankings (delegates to LeaderboardCalculator)
   */
  async calculateLeaderboardRankings(): Promise<LeaderboardRanking[]> {
    return await leaderboardCalculator.calculateLeaderboardRankings()
  }

  /**
   * Get top percentile voters based on leaderboard rankings
   */
  async getTopPercentileVoters(percentile: number): Promise<string[]> {
    try {
      console.log(`[VoterPoolSelector] Getting top ${percentile * 100}% voters`)
      
      if (percentile <= 0 || percentile > 1) {
        throw new Error("Percentile must be between 0 and 1")
      }

      const rankings = await this.calculateLeaderboardRankings()
      
      // Filter voters by percentile
      const topVoters = rankings
        .filter(ranking => ranking.percentile <= percentile)
        .map(ranking => ranking.userId)

      console.log(`[VoterPoolSelector] Found ${topVoters.length} voters in top ${percentile * 100}%`)
      return topVoters

    } catch (error) {
      console.error(`[VoterPoolSelector] Error getting top ${percentile * 100}% voters:`, error)
      throw error
    }
  }

  /**
   * Get eligible voters for Phase 1 using existing algorithm
   */
  private async getPhase1Voters(requiredCount: number): Promise<VoterPool> {
    try {
      // Get all active users who are eligible to vote
      // This integrates with the existing voter selection algorithm
      const eligibleUsers = await prisma.user.findMany({
        where: {
          isBanned: false,
          // Add any other existing eligibility criteria here
          // For example: stakeAmount > 0, etc.
        },
        select: {
          id: true
        }
      })

      const voterIds = eligibleUsers.map(user => user.id)
      
      // For Phase 1, we typically select all eligible voters or a random subset
      // depending on the existing algorithm requirements
      const selectedVoters = voterIds.slice(0, Math.max(requiredCount, voterIds.length))

      return {
        voterIds: selectedVoters,
        eligibilityCriteria: "All eligible voters (Phase 1)",
        totalEligible: voterIds.length,
        selectedCount: selectedVoters.length
      }

    } catch (error) {
      console.error("[VoterPoolSelector] Error getting Phase 1 voters:", error)
      throw error
    }
  }

  /**
   * Get voters filtered by leaderboard percentile for Phase 2 and 3
   */
  private async getLeaderboardFilteredVoters(
    phase: VotingPhase, 
    percentile: number, 
    requiredCount: number
  ): Promise<VoterPool> {
    try {
      const rankings = await this.calculateLeaderboardRankings()
      
      // Filter by percentile
      const eligibleVoters = rankings
        .filter(ranking => ranking.percentile <= percentile)
        .map(ranking => ranking.userId)

      // Handle edge case: insufficient voters in advanced phases
      if (eligibleVoters.length === 0) {
        console.warn(`[VoterPoolSelector] No voters found in top ${percentile * 100}% for ${getPhaseDescription(phase)}`)
        
        // Fallback: use top voters even if they don't meet the exact percentile
        const fallbackVoters = rankings
          .slice(0, Math.min(3, rankings.length)) // At least top 3 or all available
          .map(ranking => ranking.userId)

        return {
          voterIds: fallbackVoters,
          eligibilityCriteria: `Fallback: Top ${fallbackVoters.length} voters (insufficient for ${percentile * 100}% threshold)`,
          totalEligible: rankings.length,
          selectedCount: fallbackVoters.length
        }
      }

      // Select voters up to required count
      const selectedVoters = eligibleVoters.slice(0, Math.max(requiredCount, eligibleVoters.length))

      return {
        voterIds: selectedVoters,
        eligibilityCriteria: `Top ${percentile * 100}% leaderboard voters (${getPhaseDescription(phase)})`,
        totalEligible: rankings.length,
        selectedCount: selectedVoters.length
      }

    } catch (error) {
      console.error(`[VoterPoolSelector] Error getting leaderboard filtered voters for ${getPhaseDescription(phase)}:`, error)
      throw error
    }
  }

  /**
   * Validate voter eligibility for a specific phase
   */
  async isVoterEligibleForPhase(userId: string, phase: VotingPhase): Promise<boolean> {
    try {
      const voterPool = await this.getPhaseEligibleVoters(phase, 1000) // Large number to get all eligible
      return voterPool.voterIds.includes(userId)
    } catch (error) {
      console.error(`[VoterPoolSelector] Error checking voter eligibility for user ${userId} in phase ${phase}:`, error)
      return false
    }
  }

  /**
   * Get voter pool statistics for monitoring
   */
  async getVoterPoolStats(phase: VotingPhase): Promise<{
    totalUsers: number
    eligibleVoters: number
    percentileThreshold: number
    description: string
  }> {
    try {
      const rankings = await this.calculateLeaderboardRankings()
      const percentile = getPhasePercentile(phase)
      const eligibleCount = rankings.filter(r => r.percentile <= percentile).length

      // Get total user count
      const totalUsers = await prisma.user.count({
        where: { isBanned: false }
      })

      return {
        totalUsers: totalUsers,
        eligibleVoters: eligibleCount,
        percentileThreshold: percentile,
        description: getPhaseDescription(phase)
      }

    } catch (error) {
      console.error(`[VoterPoolSelector] Error getting voter pool stats for phase ${phase}:`, error)
      throw error
    }
  }

  /**
   * Store voter eligibility records in the database for audit purposes
   */
  async recordVoterEligibility(taskId: string, phase: VotingPhase, voterPool: VoterPool): Promise<void> {
    try {
      console.log(`[VoterPoolSelector] Recording voter eligibility for task ${taskId}, phase ${phase}`)
      
      // Clear existing eligibility records for this task and phase
      await prisma.voterEligibility.deleteMany({
        where: {
          taskId: taskId,
          phase: phase
        }
      })

      // Create new eligibility records
      const eligibilityRecords = voterPool.voterIds.map(userId => ({
        taskId: taskId,
        userId: userId,
        phase: phase,
        eligible: true,
        reason: voterPool.eligibilityCriteria
      }))

      if (eligibilityRecords.length > 0) {
        await prisma.voterEligibility.createMany({
          data: eligibilityRecords
        })
      }

      console.log(`[VoterPoolSelector] Recorded ${eligibilityRecords.length} voter eligibility records`)

    } catch (error) {
      console.error(`[VoterPoolSelector] Error recording voter eligibility:`, error)
      throw error
    }
  }

  /**
   * Get historical voter eligibility for a task
   */
  async getTaskVoterHistory(taskId: string): Promise<Array<{
    phase: number
    userId: string
    eligible: boolean
    reason: string | null
    createdAt: Date
  }>> {
    try {
      const eligibilityRecords = await prisma.voterEligibility.findMany({
        where: { taskId: taskId },
        orderBy: [
          { phase: 'asc' },
          { createdAt: 'asc' }
        ]
      })

      return eligibilityRecords.map((record: any) => ({
        phase: record.phase,
        userId: record.userId,
        eligible: record.eligible,
        reason: record.reason,
        createdAt: record.createdAt
      }))

    } catch (error) {
      console.error(`[VoterPoolSelector] Error getting voter history for task ${taskId}:`, error)
      return []
    }
  }
}

// Export singleton instance
export const voterPoolSelector = new VoterPoolSelector()