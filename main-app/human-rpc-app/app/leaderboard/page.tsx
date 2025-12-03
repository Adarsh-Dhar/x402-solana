"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { Trophy, Medal, Award, Loader2 } from "lucide-react"

interface LeaderboardEntry {
  rank: number
  email: string
  points: number
}

interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[]
  totalUsers: number
}

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await fetch("/api/leaderboard")
        if (!response.ok) {
          throw new Error(`Failed to fetch leaderboard: ${response.statusText}`)
        }
        const data: LeaderboardResponse = await response.json()
        setLeaderboard(data.leaderboard)
      } catch (err) {
        console.error("Error fetching leaderboard:", err)
        setError(err instanceof Error ? err.message : "Failed to load leaderboard")
        setLeaderboard([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchLeaderboard()
    
    // Refresh leaderboard every 30 seconds
    const interval = setInterval(fetchLeaderboard, 30000)
    return () => clearInterval(interval)
  }, [])

  const getRankIcon = (rank: number) => {
    if (rank === 1) {
      return <Trophy className="h-6 w-6 text-yellow-500" />
    } else if (rank === 2) {
      return <Medal className="h-6 w-6 text-gray-400" />
    } else if (rank === 3) {
      return <Award className="h-6 w-6 text-amber-600" />
    }
    return null
  }

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) {
      return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
    } else if (rank === 2) {
      return "bg-gray-400/20 text-gray-400 border-gray-400/50"
    } else if (rank === 3) {
      return "bg-amber-600/20 text-amber-600 border-amber-600/50"
    }
    return "bg-card/50 text-muted-foreground border-border"
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Leaderboard</h1>
          <p className="text-muted-foreground">
            Top users ranked by points. Earn points by matching the consensus decision.
          </p>
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400"
          >
            <p className="font-semibold">Error loading leaderboard</p>
            <p className="text-sm">{error}</p>
          </motion.div>
        )}

        {isLoading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center py-12"
          >
            <Loader2 className="h-8 w-8 animate-spin text-[var(--neon-green)]" />
            <span className="ml-3 text-muted-foreground">Loading leaderboard...</span>
          </motion.div>
        )}

        {!isLoading && !error && leaderboard.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-card/50 p-8 text-center backdrop-blur-sm"
          >
            <Trophy className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              No users on the leaderboard yet. Start voting on tasks to earn points!
            </p>
          </motion.div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-card/30">
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Rank</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-foreground">Email</th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-foreground">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, index) => (
                    <motion.tr
                      key={entry.email}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-b border-border/50 hover:bg-card/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-lg border ${getRankBadgeColor(entry.rank)}`}
                          >
                            {getRankIcon(entry.rank) || (
                              <span className="text-sm font-bold">{entry.rank}</span>
                            )}
                          </div>
                          {!getRankIcon(entry.rank) && (
                            <span className="text-sm font-medium text-muted-foreground">#{entry.rank}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-foreground">{entry.email}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-lg font-bold text-[var(--neon-green)]">{entry.points}</span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {!isLoading && !error && leaderboard.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 rounded-xl border border-border bg-card/30 p-4 backdrop-blur-sm"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Total users: <span className="font-semibold text-foreground">{leaderboard.length}</span>
              </span>
              <span className="text-muted-foreground">
                Points are awarded: <span className="font-semibold text-[var(--neon-green)]">+3</span> for matching consensus,{" "}
                <span className="font-semibold text-[var(--alert-red)]">-1</span> for opposite
              </span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

