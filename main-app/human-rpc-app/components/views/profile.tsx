"use client"

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { motion } from "framer-motion"
import { ArrowLeft, Shield, TrendingUp, DollarSign, CheckCircle, XCircle, Clock, Lock, Unlock } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
import { RankBadge, GodModeBadge, RankProgress } from "@/components/ui/rank-badge"
import { getAccessibleTiers } from "@/lib/task-eligibility"

interface ProfileProps {
  onBack: () => void
}

export default function Profile({ onBack }: ProfileProps) {
  const { data: session } = useSession()
  const [userStats, setUserStats] = useState<{
    email: string
    points: number
    rank: string | null
    godModeBadge: boolean
    godModeBadgeEarnedAt: string | null
    totalVotes: number
    correctVotes: number
    accuracy: number
    consecutiveCorrectDays: number
    stakeAmount: number | null
    isBanned: boolean
    createdAt: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchUserStats = async () => {
      if (!session?.user?.email) {
        setIsLoading(false)
        return
      }

      try {
        setIsLoading(true)
        const response = await fetch("/api/user/profile")
        if (response.ok) {
          const data = await response.json()
          setUserStats(data)
        }
      } catch (error) {
        console.error("Error fetching user stats:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserStats()
  }, [session])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">Loading profile...</div>
      </div>
    )
  }

  if (!userStats) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">Please log in to view your profile</div>
      </div>
    )
  }

  const accessibleTiers = getAccessibleTiers(userStats.rank as any)
  const allTiers = ["TRAINING", "LIVE_FIRE", "DISPUTE"] as const
  const tierLabels = {
    TRAINING: "Training Tasks",
    LIVE_FIRE: "Live Fire Tasks",
    DISPUTE: "Dispute Resolution",
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={onBack}
        className="mb-6 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        <span className="font-mono text-sm">Back to Dashboard</span>
      </motion.button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
      >
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative">
            <Avatar className="h-24 w-24 border-2 border-[var(--solana-purple)]">
              <AvatarImage src="/cyberpunk-profile-avatar.png" />
              <AvatarFallback className="bg-muted text-2xl font-bold">
                {userStats.email.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {userStats.godModeBadge && (
              <span className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full border-4 border-card bg-[var(--neon-green)]" />
            )}
          </div>

          <div className="flex-1 text-center sm:text-left">
            <div className="mb-2 flex items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-bold text-foreground">{userStats.email}</h1>
              <RankBadge rank={userStats.rank as any} size="sm" />
              {userStats.godModeBadge && <GodModeBadge size="sm" />}
            </div>
            {userStats.isBanned && (
              <p className="mb-4 text-sm font-semibold text-[var(--alert-red)]">⚠️ Account Banned</p>
            )}

            <div className="flex flex-wrap justify-center gap-4 sm:justify-start">
              <div className="rounded-lg border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 px-4 py-2">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--neon-green)]" />
                  <span className="font-mono text-lg font-bold text-[var(--neon-green)]">
                    {userStats.points}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Points</p>
              </div>

              {userStats.stakeAmount !== null && (
                <div className="rounded-lg border border-[var(--solana-purple)]/30 bg-[var(--solana-purple)]/10 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-[var(--solana-purple)]" />
                    <span className="font-mono text-lg font-bold text-[var(--solana-purple)]">
                      ${userStats.stakeAmount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Staked</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8 grid gap-4 sm:grid-cols-3"
      >
        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-[var(--neon-green)]" />
            <span className="text-sm text-muted-foreground">Total Votes</span>
          </div>
          <p className="font-mono text-3xl font-bold text-foreground">{userStats.totalVotes}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {userStats.correctVotes} correct
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[var(--solana-purple)]" />
            <span className="text-sm text-muted-foreground">Accuracy Rate</span>
          </div>
          <p className="font-mono text-3xl font-bold text-foreground">{userStats.accuracy.toFixed(1)}%</p>
          <Progress
            value={userStats.accuracy}
            className="mt-2 h-1.5 bg-muted [&>div]:bg-[var(--solana-purple)]"
          />
        </div>

        <div className="rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <Shield className="h-5 w-5 text-[var(--neon-green)]" />
            <span className="text-sm text-muted-foreground">Consecutive Days</span>
          </div>
          <p className="font-mono text-3xl font-bold text-[var(--neon-green)]">
            {userStats.consecutiveCorrectDays}
          </p>
          {userStats.godModeBadge && (
            <p className="mt-1 text-xs text-[var(--neon-green)]">God Mode Active!</p>
          )}
        </div>
      </motion.div>

      {/* Rank Progress */}
      {userStats.rank && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8 rounded-xl border border-border bg-card/50 p-6 backdrop-blur-sm"
        >
          <h2 className="mb-4 font-semibold text-foreground">Rank Progression</h2>
          <RankProgress
            currentRank={userStats.rank as any}
            progress={userStats.rank === "ARBITER" ? 100 : userStats.rank === "OFFICER" ? 75 : 25}
          />
        </motion.div>
      )}

      {/* Task Tier Access */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mb-8 rounded-xl border border-border bg-card/50 backdrop-blur-sm"
      >
        <div className="border-b border-border p-4">
          <h2 className="font-semibold text-foreground">Task Tier Access</h2>
        </div>
        <div className="divide-y divide-border p-4">
          {allTiers.map((tier) => {
            const hasAccess = accessibleTiers.includes(tier)
            return (
              <div key={tier} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  {hasAccess ? (
                    <Unlock className="h-5 w-5 text-[var(--neon-green)]" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className={hasAccess ? "text-foreground" : "text-muted-foreground"}>
                    {tierLabels[tier]}
                  </span>
                </div>
                {hasAccess ? (
                  <span className="text-xs text-[var(--neon-green)]">Unlocked</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Locked</span>
                )}
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* God Mode Badge Info */}
      {userStats.godModeBadge && userStats.godModeBadgeEarnedAt && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-8 rounded-xl border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 p-6 backdrop-blur-sm"
        >
          <div className="flex items-center gap-3">
            <GodModeBadge size="lg" />
            <div>
              <h3 className="font-semibold text-foreground">God Mode Badge Earned</h3>
              <p className="text-sm text-muted-foreground">
                Earned on {new Date(userStats.godModeBadgeEarnedAt).toLocaleDateString()}
              </p>
              <p className="mt-1 text-xs text-[var(--neon-green)]">
                Platform fees reduced to 0% - You are a Truth Champion!
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
