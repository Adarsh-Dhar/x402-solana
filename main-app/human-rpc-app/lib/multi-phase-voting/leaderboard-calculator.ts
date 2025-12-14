/**
 * Leaderboard Calculator Service
 * 
 * Calculates voter rankings based on historical voting accuracy for multi-phase voting
 * voter pool selection. Implements caching with TTL for performance optimization.
 */

import { prisma } from "@/lib/prisma"
import type { LeaderboardRanking, LeaderboardMetrics } from "./types"

/**
 * Cache configuration for leaderboard calculations
 */
interface CacheEntry {
  data: LeaderboardRanking[]
  timestamp: Date
  ttl: number // Time to live in milliseconds
}

export class LeaderboardCalculator {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds
  private readonly RECENT_ACCURACY_DAYS = 30

  /**
   * Calculate leaderboard rankings using voting accuracy as the primary metric
   * Implements caching with TTL for performance optimization
   */
  async calculateLeaderboardRankings(): Promise<LeaderboardRanking[]> {
    try {
      console.log("[LeaderboardCalculator] Calculating leaderboard rankings")
      
      // Check cache first
      const cacheKey = "leaderboard_rankings"
      const cachedEntry = this.cache.get(cacheKey)
      
      if (cachedEntry && this.isCacheValid(cachedEntry)) {
        console.log("[LeaderboardCalculator] Returning cached leaderboard rankings")
        return cachedEntry.data
      }

      // Calculate fresh rankings
      const rankings = await this.calculateFreshRankings()
      
      // Cache the results
      this.cache.set(cacheKey, {
        data: rankings,
        timestamp: new Date(),
        ttl: this.DEFAULT_TTL
      })

      console.log(`[LeaderboardCalculator] Calculated ${rankings.length} leaderboard rankings`)
      return rankings

    } catch (error) {
      console.error("[LeaderboardCalculator] Error calculating leaderboard rankings:", error)
      throw error
    }
  }

  /**
   * Get top percentile voters for phase-specific filtering
   */
  async getTopPercentileVoters(percentile: number): Promise<string[]> {
    try {
      console.log(`[LeaderboardCalculator] Getting top ${percentile * 100}% voters`)
      
      if (percentile <= 0 || percentile > 1) {
        throw new Error("Percentile must be between 0 and 1")
      }

      const rankings = await this.calculateLeaderboardRankings()
      
      // Filter voters by percentile
      const topVoters = rankings
        .filter(ranking => ranking.percentile <= percentile)
        .map(ranking => ranking.userId)

      console.log(`[LeaderboardCalculator] Found ${topVoters.length} voters in top ${percentile * 100}%`)
      return topVoters

    } catch (error) {
      console.error(`[LeaderboardCalculator] Error getting top ${percentile * 100}% voters:`, error)
      throw error
    }
  }

  /**
   * Get detailed leaderboard metrics for a specific user
   */
  async getUserLeaderboardMetrics(userId: string): Promise<LeaderboardMetrics | null> {
    try {
      const rankings = await this.calculateLeaderboardRankings()
      const userRanking = rankings.find(r => r.userId === userId)
      
      if (!userRanking) {
        return null
      }

      // Get additional metrics
      const recentAccuracy = await this.calculateRecentAccuracy(userId)
      const consecutiveCorrect = await this.calculateConsecutiveCorrectDays(userId)

      return {
        userId: userRanking.userId,
        totalVotes: userRanking.totalVotes,
        correctVotes: Math.round(userRanking.totalVotes * userRanking.accuracy),
        accuracy: userRanking.accuracy,
        recentAccuracy: recentAccuracy,
        consecutiveCorrect: consecutiveCorrect,
        rank: userRanking.rank,
        percentile: userRanking.percentile,
        lastUpdated: new Date()
      }

    } catch (error) {
      console.error(`[LeaderboardCalculator] Error getting metrics for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Invalidate cache (useful for testing or when vote accuracy is updated)
   */
  invalidateCache(): void {
    console.log("[LeaderboardCalculator] Invalidating cache")
    this.cache.clear()
  }

  /**
   * Calculate fresh rankings from the database
   */
  private async calculateFreshRankings(): Promise<LeaderboardRanking[]> {
    // Get all vote accuracy records
    const allVoteAccuracies = await prisma.voteAccuracy.findMany({
      select: {
        userId: true,
        isCorrect: true
      }
    })

    // Group by user and calculate accuracy
    const userStats = new Map<string, { total: number; correct: number }>()
    
    for (const vote of allVoteAccuracies) {
      const stats = userStats.get(vote.userId) || { total: 0, correct: 0 }
      stats.total++
      if (vote.isCorrect) {
        stats.correct++
      }
      userStats.set(vote.userId, stats)
    }

    // Calculate accuracy and create rankings
    const rankings: LeaderboardRanking[] = []
    
    for (const [userId, stats] of userStats.entries()) {
      const accuracyRate = stats.total > 0 ? stats.correct / stats.total : 0

      // Only include users with at least 3 votes for meaningful accuracy
      if (stats.total >= 3) {
        rankings.push({
          userId: userId,
          accuracy: accuracyRate,
          totalVotes: stats.total,
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

  /**
   * Calculate recent accuracy (last 30 days) for a user
   */
  private async calculateRecentAccuracy(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - this.RECENT_ACCURACY_DAYS)

    const recentAccuracies = await prisma.voteAccuracy.findMany({
      where: {
        userId: userId,
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    })

    if (recentAccuracies.length === 0) {
      return 0
    }

    const correctVotes = recentAccuracies.filter(va => va.isCorrect).length
    return correctVotes / recentAccuracies.length
  }

  /**
   * Calculate consecutive correct voting days for a user
   */
  private async calculateConsecutiveCorrectDays(userId: string): Promise<number> {
    // Get recent vote accuracies ordered by date (most recent first)
    const recentAccuracies = await prisma.voteAccuracy.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30 // Last 30 votes
    })

    let consecutiveDays = 0
    const voteDates = new Set<string>()

    for (const accuracy of recentAccuracies) {
      const dateStr = accuracy.createdAt.toISOString().split('T')[0]
      
      // Skip if we already counted this date
      if (voteDates.has(dateStr)) {
        continue
      }
      
      voteDates.add(dateStr)
      
      if (accuracy.isCorrect) {
        consecutiveDays++
      } else {
        break // Stop at first incorrect vote
      }
    }

    return consecutiveDays
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(entry: CacheEntry): boolean {
    const now = new Date()
    const age = now.getTime() - entry.timestamp.getTime()
    return age < entry.ttl
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    }
  }
}

// Export singleton instance
export const leaderboardCalculator = new LeaderboardCalculator()