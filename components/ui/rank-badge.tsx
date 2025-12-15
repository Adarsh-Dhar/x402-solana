"use client"

import { motion } from "framer-motion"
import { Shield, Crown, Star, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export type UserRank = "CADET" | "OFFICER" | "ARBITER"

interface RankBadgeProps {
  rank: UserRank | null | undefined
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

export function RankBadge({ rank, size = "md", showLabel = true, className }: RankBadgeProps) {
  const rankConfig = {
    CADET: {
      label: "Cadet",
      icon: Shield,
      color: "text-blue-400",
      bgColor: "bg-blue-500/20",
      borderColor: "border-blue-500/30",
      glow: "shadow-[0_0_20px_rgba(96,165,250,0.3)]",
    },
    OFFICER: {
      label: "Officer",
      icon: Star,
      color: "text-purple-400",
      bgColor: "bg-purple-500/20",
      borderColor: "border-purple-500/30",
      glow: "shadow-[0_0_20px_rgba(192,132,252,0.3)]",
    },
    ARBITER: {
      label: "Arbiter",
      icon: Crown,
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/20",
      borderColor: "border-yellow-500/30",
      glow: "shadow-[0_0_20px_rgba(250,204,21,0.3)]",
    },
  }

  const sizeConfig = {
    sm: {
      icon: "h-3 w-3",
      text: "text-xs",
      padding: "px-2 py-0.5",
    },
    md: {
      icon: "h-4 w-4",
      text: "text-sm",
      padding: "px-3 py-1",
    },
    lg: {
      icon: "h-5 w-5",
      text: "text-base",
      padding: "px-4 py-1.5",
    },
  }

  const currentRank = rank || "CADET"
  const config = rankConfig[currentRank]
  const sizeStyle = sizeConfig[size]
  const Icon = config.icon

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border",
        config.bgColor,
        config.borderColor,
        sizeStyle.padding,
        config.glow,
        className
      )}
    >
      <Icon className={cn(sizeStyle.icon, config.color)} />
      {showLabel && (
        <span className={cn("font-mono font-bold", sizeStyle.text, config.color)}>
          {config.label}
        </span>
      )}
    </motion.div>
  )
}

interface GodModeBadgeProps {
  size?: "sm" | "md" | "lg"
  showLabel?: boolean
  className?: string
}

export function GodModeBadge({ size = "md", showLabel = true, className }: GodModeBadgeProps) {
  const sizeConfig = {
    sm: {
      icon: "h-3 w-3",
      text: "text-xs",
      padding: "px-2 py-0.5",
    },
    md: {
      icon: "h-4 w-4",
      text: "text-sm",
      padding: "px-3 py-1",
    },
    lg: {
      icon: "h-5 w-5",
      text: "text-base",
      padding: "px-4 py-1.5",
    },
  }

  const sizeStyle = sizeConfig[size]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.05 }}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--neon-green)]/50 bg-gradient-to-r from-[var(--neon-green)]/20 to-[var(--neon-green)]/10",
        sizeStyle.padding,
        "shadow-[0_0_30px_rgba(34,197,94,0.4)]",
        className
      )}
    >
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      >
        <Zap className={cn(sizeStyle.icon, "text-[var(--neon-green)]")} />
      </motion.div>
      {showLabel && (
        <span className={cn("font-mono font-bold", sizeStyle.text, "text-[var(--neon-green)]")}>
          GOD MODE
        </span>
      )}
    </motion.div>
  )
}

interface RankProgressProps {
  currentRank: UserRank | null | undefined
  nextRank?: UserRank | null
  progress?: number // 0-100
  className?: string
}

export function RankProgress({ currentRank, nextRank, progress = 0, className }: RankProgressProps) {
  const rank = currentRank || "CADET"
  const next = nextRank || (rank === "CADET" ? "OFFICER" : rank === "OFFICER" ? "ARBITER" : null)

  if (!next) {
    return (
      <div className={cn("text-center", className)}>
        <p className="text-sm text-muted-foreground">Maximum rank achieved!</p>
      </div>
    )
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Progress to {next}</span>
        <span className="font-mono font-semibold text-foreground">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-[var(--neon-green)] to-[var(--solana-purple)]"
        />
      </div>
    </div>
  )
}

