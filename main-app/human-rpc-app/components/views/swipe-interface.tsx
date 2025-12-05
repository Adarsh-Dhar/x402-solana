"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { motion, AnimatePresence, useMotionValue, useTransform, useMotionValueEvent } from "framer-motion"
import { Check, X, Zap, Flame } from "lucide-react"
import { RankBadge, GodModeBadge } from "@/components/ui/rank-badge"
import type { Task } from "../human-rpc-app"

interface SwipeInterfaceProps {
  tasks: Task[]
  onTaskComplete: (taskId: string, decision: "yes" | "no") => void
  isLoading?: boolean
  error?: string | null
}

interface SwipeState {
  currentIndex: number
  swipeDirection: "left" | "right" | null
  isSwiping: boolean
}

interface StreakData {
  count: number
  multiplier: number
  lastMatchTime: number | null
}

// Haptic feedback helper
const triggerHaptic = (pattern: "light" | "medium" | "heavy" | "success" = "medium") => {
  if (typeof window === "undefined" || !("vibrate" in navigator)) return

  const patterns = {
    light: [10],
    medium: [20],
    heavy: [30],
    success: [50, 30, 50], // Success pattern for matches
  }

  navigator.vibrate(patterns[pattern])
}

// Casino coin sound generator (using Web Audio API)
const playCoinSound = () => {
  if (typeof window === "undefined" || !window.AudioContext) return

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)

    // Create a satisfying coin drop sound
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)

    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + 0.2)
  } catch (error) {
    console.error("Error playing coin sound:", error)
  }
}

export default function SwipeInterface({ tasks, onTaskComplete, isLoading = false, error = null }: SwipeInterfaceProps) {
  const { data: session } = useSession()
  const [swipeState, setSwipeState] = useState<SwipeState>({
    currentIndex: 0,
    swipeDirection: null,
    isSwiping: false,
  })
  const [streak, setStreak] = useState<StreakData>({
    count: 0,
    multiplier: 1.0,
    lastMatchTime: null,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submittedTasks, setSubmittedTasks] = useState<Set<string>>(new Set())
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [userStats, setUserStats] = useState<{
    rank: string | null
    godModeBadge: boolean
    accuracy: number
    totalVotes: number
    points: number
  } | null>(null)

  const currentTask = tasks[swipeState.currentIndex]
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-300, 300], [-25, 25])
  const opacity = useTransform(x, [-300, -150, 0, 150, 300], [0, 1, 1, 1, 0])
  const [dragX, setDragX] = useState(0)

  // Track drag position reactively
  useMotionValueEvent(x, "change", (latest) => {
    setDragX(latest)
  })

  // Sync user email from session
  useEffect(() => {
    if (session?.user?.email) {
      setUserEmail(session.user.email)
    } else {
      setUserEmail(null)
    }
  }, [session])

  // Fetch user stats
  useEffect(() => {
    const fetchUserStats = async () => {
      if (!session?.user?.email) {
        setUserStats(null)
        return
      }

      try {
        const response = await fetch("/api/user/profile")
        if (response.ok) {
          const data = await response.json()
          setUserStats({
            rank: data.rank || null,
            godModeBadge: data.godModeBadge || false,
            accuracy: data.accuracy || 0,
            totalVotes: data.totalVotes || 0,
            points: data.points || 0,
          })
        }
      } catch (error) {
        console.error("Error fetching user stats:", error)
      }
    }

    fetchUserStats()
    // Refresh stats periodically
    const interval = setInterval(fetchUserStats, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [session])

  // Reset drag position when task changes
  useEffect(() => {
    x.set(0)
    setDragX(0)
  }, [swipeState.currentIndex, x])

  // Reset streak if too much time passes (5 seconds)
  useEffect(() => {
    if (streak.lastMatchTime) {
      const timer = setTimeout(() => {
        setStreak((prev) => ({
          ...prev,
          count: 0,
          multiplier: 1.0,
          lastMatchTime: null,
        }))
      }, 5000)

      return () => clearTimeout(timer)
    }
  }, [streak.lastMatchTime])

  const handleSwipe = async (direction: "left" | "right") => {
    if (!currentTask || isSubmitting || submittedTasks.has(currentTask.id)) return

    const decision = direction === "right" ? "yes" : "no"
    setIsSubmitting(true)

    try {
      const taskId = currentTask.taskId || currentTask.id.replace(/^#/, "")
      
      const response = await fetch(`/api/v1/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ decision, userEmail }),
      })

      if (!response.ok) {
        throw new Error("Failed to submit decision")
      }

      const result = await response.json()
      
      // Mark task as submitted
      setSubmittedTasks((prev) => new Set(prev).add(currentTask.id))

      // Check if consensus was reached (match!)
      if (result.consensus?.reached) {
        // Increment streak
        const now = Date.now()
        const timeSinceLastMatch = streak.lastMatchTime ? now - streak.lastMatchTime : Infinity
        
        let newStreak = streak.count + 1
        let newMultiplier = 1.0

        // Calculate multiplier based on streak and speed
        if (timeSinceLastMatch < 3000) {
          // Fast match bonus
          newMultiplier = Math.min(1.0 + newStreak * 0.1, 3.0)
        } else {
          newMultiplier = Math.min(1.0 + newStreak * 0.05, 2.5)
        }

        setStreak({
          count: newStreak,
          multiplier: newMultiplier,
          lastMatchTime: now,
        })

        // Play success effects
        triggerHaptic("success")
        playCoinSound()
      } else {
        // No consensus yet, but still provide feedback
        triggerHaptic("medium")
      }

      // Move to next task
      setTimeout(() => {
        setSwipeState((prev) => ({
          ...prev,
          currentIndex: Math.min(prev.currentIndex + 1, tasks.length - 1),
          swipeDirection: null,
        }))
        x.set(0)
        setDragX(0)
        setIsSubmitting(false)
      }, 300)
    } catch (error) {
      console.error("Error submitting decision:", error)
      setIsSubmitting(false)
      triggerHaptic("heavy") // Error feedback
    }
  }

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 100
    const velocity = info.velocity.x

    if (Math.abs(info.offset.x) > threshold || Math.abs(velocity) > 500) {
      const direction = info.offset.x > 0 ? "right" : "left"
      handleSwipe(direction)
    } else {
      // Snap back
      x.set(0)
      setDragX(0)
    }
  }

  const handleButtonSwipe = (direction: "left" | "right") => {
    if (isSubmitting || submittedTasks.has(currentTask?.id || "")) return
    
    // Animate card out
    x.set(direction === "right" ? 500 : -500)
    setTimeout(() => {
      handleSwipe(direction)
    }, 200)
  }

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="mx-auto mb-4 h-12 w-12 rounded-full border-4 border-[var(--neon-green)] border-t-transparent"
          />
          <p className="text-muted-foreground">Loading tasks...</p>
        </motion.div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="text-center">
          <X className="mx-auto mb-4 h-12 w-12 text-[var(--alert-red)]" />
          <p className="mb-2 text-lg font-semibold text-foreground">Error loading tasks</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  if (!tasks.length || !currentTask) {
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <div className="text-center">
          <Zap className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
          <p className="mb-2 text-lg font-semibold text-foreground">No tasks available</p>
          <p className="text-sm text-muted-foreground">
            More tasks will appear here when agents need human review.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-gradient-to-b from-background to-background/80">
      {/* User Stats Bar */}
      {userStats && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <RankBadge rank={userStats.rank as any} size="sm" />
            {userStats.godModeBadge && <GodModeBadge size="sm" />}
          </div>
          <div className="flex items-center gap-3 rounded-full border border-border/50 bg-card/80 px-3 py-1.5 backdrop-blur-sm">
            <div className="text-right">
              <div className="font-mono text-xs font-bold text-foreground">
                {userStats.points} pts
              </div>
              <div className="text-xs text-muted-foreground">
                {userStats.accuracy.toFixed(1)}% acc
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Streak Display */}
      {streak.count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-16 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="flex items-center gap-2 rounded-full border border-[var(--neon-green)]/30 bg-[var(--neon-green)]/10 px-4 py-2 backdrop-blur-sm">
            <Flame className="h-4 w-4 text-[var(--neon-green)]" />
            <span className="font-mono text-sm font-bold text-[var(--neon-green)]">
              STREAK: {streak.count}x
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              ×{streak.multiplier.toFixed(1)}
            </span>
          </div>
        </motion.div>
      )}

      {/* Card Stack */}
      <div className="relative flex flex-1 items-center justify-center p-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTask.id}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            style={{ x, rotate, opacity }}
            initial={{ scale: 0.9, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0, x: swipeState.swipeDirection === "right" ? 500 : -500 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="absolute h-[70vh] w-full max-w-md cursor-grab active:cursor-grabbing"
          >
            {/* Card */}
            <div className="relative h-full w-full rounded-3xl border border-border bg-card shadow-2xl">
              {/* Swipe Indicators */}
              <AnimatePresence>
                {Math.abs(dragX) > 50 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`absolute inset-0 flex items-center justify-center rounded-3xl ${
                      dragX > 0
                        ? "bg-[var(--neon-green)]/20"
                        : "bg-[var(--alert-red)]/20"
                    }`}
                  >
                    {dragX > 0 ? (
                      <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <Check className="h-16 w-16 text-[var(--neon-green)]" />
                        <span className="font-mono text-lg font-bold text-[var(--neon-green)]">
                          SAFE / ACCURATE
                        </span>
                      </motion.div>
                    ) : (
                      <motion.div
                        initial={{ scale: 0.5 }}
                        animate={{ scale: 1 }}
                        className="flex flex-col items-center gap-2"
                      >
                        <X className="h-16 w-16 text-[var(--alert-red)]" />
                        <span className="font-mono text-lg font-bold text-[var(--alert-red)]">
                          HALLUCINATION / UNSAFE
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Card Content */}
              <div className="relative z-10 flex h-full flex-col p-6">
                {/* Header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="rounded-full bg-[var(--solana-purple)]/20 px-3 py-1">
                    <span className="font-mono text-xs text-[var(--solana-purple)]">
                      {currentTask.agentName}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-[var(--neon-green)]">
                      {currentTask.reward}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {swipeState.currentIndex + 1} / {tasks.length}
                    </div>
                  </div>
                </div>

                {/* Email Content */}
                <div className="flex-1 overflow-y-auto">
                  <div className="mb-4 rounded-xl border border-border bg-background/50 p-4">
                    <div className="mb-2 font-mono text-xs text-muted-foreground">
                      AI-Generated Email
                    </div>
                    <div className="space-y-3 text-sm leading-relaxed text-foreground">
                      {currentTask.context?.summary ? (
                        <p className="whitespace-pre-wrap">{currentTask.context.summary}</p>
                      ) : (
                        <p className="text-muted-foreground">No content available</p>
                      )}
                    </div>
                  </div>

                  {/* Task Metadata */}
                  <div className="mt-4 space-y-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Category:</span>
                      <span className="font-mono">{currentTask.category}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Created:</span>
                      <span className="font-mono">{currentTask.createdAt}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-6 pb-8">
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleButtonSwipe("left")}
          disabled={isSubmitting || submittedTasks.has(currentTask?.id || "")}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--alert-red)] bg-background transition-all hover:bg-[var(--alert-red)]/10 disabled:opacity-50"
        >
          <X className="h-8 w-8 text-[var(--alert-red)]" />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => handleButtonSwipe("right")}
          disabled={isSubmitting || submittedTasks.has(currentTask?.id || "")}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[var(--neon-green)] bg-background transition-all hover:bg-[var(--neon-green)]/10 disabled:opacity-50"
        >
          <Check className="h-8 w-8 text-[var(--neon-green)]" />
        </motion.button>
      </div>

      {/* Instructions */}
      <div className="pb-4 text-center">
        <p className="text-xs text-muted-foreground">
          Swipe right for <span className="text-[var(--neon-green)]">Safe/Accurate</span> • 
          Swipe left for <span className="text-[var(--alert-red)]">Hallucination/Unsafe</span>
        </p>
      </div>
    </div>
  )
}

