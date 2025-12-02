"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Settings, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ViewType } from "../human-rpc-app"

interface DevMenuProps {
  currentView: ViewType
  onNavigate: (view: ViewType) => void
}

const views: { id: ViewType; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "task-details", label: "Task Details" },
  { id: "profile", label: "Profile" },
  { id: "login", label: "Login" },
  { id: "register", label: "Register" },
]

export default function DevMenu({ currentView, onNavigate }: DevMenuProps) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="mb-2 rounded-lg border border-border bg-card/95 p-2 backdrop-blur-xl"
          >
            <p className="mb-2 px-2 font-mono text-xs text-muted-foreground">Dev Navigation</p>
            <div className="flex flex-col gap-1">
              {views.map((view) => (
                <button
                  key={view.id}
                  onClick={() => {
                    onNavigate(view.id)
                    setIsOpen(false)
                  }}
                  className={`rounded-md px-3 py-1.5 text-left font-mono text-xs transition-colors ${
                    currentView === view.id
                      ? "bg-[var(--neon-green)]/20 text-[var(--neon-green)]"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {view.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2 border-border bg-card/95 font-mono text-xs backdrop-blur-xl hover:bg-muted"
      >
        <Settings className="h-3.5 w-3.5" />
        Dev Menu
        <ChevronUp className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </Button>
    </div>
  )
}
