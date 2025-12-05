"use client"

import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { Bell, Cpu, LogOut, Trophy, Medal, Award } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useSession, signOut } from "next-auth/react"
import { useState, useEffect } from "react"

interface HeaderProps {
  onProfileClick: () => void
  onLogoClick: () => void
  hasUrgentNotification: boolean
  onNotificationClick: () => void
}

export default function Header({
  onProfileClick,
  onLogoClick,
  hasUrgentNotification,
  onNotificationClick,
}: HeaderProps) {
  const { data: session, status } = useSession()
  const [userRank, setUserRank] = useState<number | null>(null)
  const [totalUsers, setTotalUsers] = useState<number>(0)

  useEffect(() => {
    const fetchUserRank = async () => {
      if (!session?.user?.email) {
        setUserRank(null)
        return
      }

      try {
        const response = await fetch("/api/leaderboard")
        if (response.ok) {
          const data = await response.json()
          setTotalUsers(data.totalUsers || 0)
          
          // Find current user's rank
          const userEntry = data.leaderboard?.find(
            (entry: { email: string; rank: number }) => entry.email === session.user.email
          )
          if (userEntry) {
            setUserRank(userEntry.rank)
          }
        }
      } catch (error) {
        console.error("Error fetching user rank:", error)
      }
    }

    fetchUserRank()
    // Refresh rank every 30 seconds
    const interval = setInterval(fetchUserRank, 30000)
    return () => clearInterval(interval)
  }, [session])

  const calculatePercentile = (rank: number, total: number) => {
    if (total === 0) return 100
    return (rank / total) * 100
  }

  const getRankIcon = (percentile: number) => {
    if (percentile <= 1) {
      return <Trophy className="h-4 w-4 text-yellow-500" />
    } else if (percentile <= 5) {
      return <Medal className="h-4 w-4 text-gray-400" />
    } else if (percentile <= 10) {
      return <Award className="h-4 w-4 text-amber-600" />
    }
    return null
  }

  const getRankBadgeColor = (percentile: number) => {
    if (percentile <= 1) {
      return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50"
    } else if (percentile <= 5) {
      return "bg-gray-400/20 text-gray-400 border-gray-400/50"
    } else if (percentile <= 10) {
      return "bg-amber-600/20 text-amber-600 border-amber-600/50"
    }
    return "bg-card/50 text-muted-foreground border-border"
  }

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl"
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <button onClick={onLogoClick} className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
            <Cpu className="h-5 w-5 text-[var(--neon-green)]" />
          </div>
          <span className="font-mono text-lg font-bold tracking-tight text-foreground">
            Human<span className="text-[var(--neon-green)]">RPC</span>
          </span>
        </button>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Button variant="ghost" size="icon" className="relative hover:bg-muted" onClick={onNotificationClick}>
              <Bell className="h-5 w-5 text-muted-foreground" />
              {hasUrgentNotification && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-[var(--alert-red)]"
                >
                  <span className="absolute inset-0 animate-ping rounded-full bg-[var(--alert-red)] opacity-75" />
                </motion.span>
              )}
            </Button>
          </div>

          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden items-center gap-1.5 rounded-full border-border/60 bg-background/60 px-3 text-xs font-mono text-muted-foreground hover:border-[var(--neon-green)]/60 hover:bg-[var(--neon-green)]/10 hover:text-[var(--neon-green)] sm:inline-flex"
          >
            <Link href="/leaderboard">
              <Trophy className="h-3.5 w-3.5" />
              <span>Leaderboard</span>
            </Link>
          </Button>

          {status === "authenticated" && (
            <>
              {session?.user?.email && (
                <div className="hidden items-center gap-2 sm:flex">
                  {userRank !== null && totalUsers > 0 && (() => {
                    const percentile = calculatePercentile(userRank, totalUsers)
                    const icon = getRankIcon(percentile)
                    return (
                      <div
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border ${getRankBadgeColor(percentile)}`}
                        title={`Rank #${userRank} (Top ${percentile.toFixed(1)}%)`}
                      >
                        {icon || (
                          <span className="text-xs font-bold">{userRank}</span>
                        )}
                      </div>
                    )
                  })()}
                  <span className="text-xs font-mono text-muted-foreground">
                    {session.user.email}
                  </span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                className="hidden items-center gap-1 rounded-full border-border/60 bg-background/60 px-3 text-xs font-mono text-muted-foreground hover:border-[var(--alert-red)]/50 hover:bg-[var(--alert-red)]/10 hover:text-[var(--alert-red)] sm:inline-flex"
                onClick={() =>
                  signOut({
                    callbackUrl: "/login",
                  })
                }
              >
                <LogOut className="h-3 w-3" />
                Logout
              </Button>
            </>
          )}

          <button
            onClick={onProfileClick}
            className="group relative rounded-full ring-2 ring-transparent transition-all hover:ring-[var(--solana-purple)]/50"
          >
            <Avatar className="h-9 w-9 border border-border">
              <AvatarImage src="/cyberpunk-avatar.png" />
              <AvatarFallback className="bg-muted text-xs font-medium">JD</AvatarFallback>
            </Avatar>
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-[var(--neon-green)]" />
          </button>
        </div>
      </div>
    </motion.header>
  )
}
