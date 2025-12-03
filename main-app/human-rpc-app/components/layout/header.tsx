"use client"

import { motion } from "framer-motion"
import { Bell, Cpu, LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useSession, signOut } from "next-auth/react"

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

          {status === "authenticated" && (
            <>
              {session?.user?.email && (
                <span className="hidden text-xs font-mono text-muted-foreground sm:inline">
                  {session.user.email}
                </span>
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
