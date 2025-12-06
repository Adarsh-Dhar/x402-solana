"use client"

import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle } from "lucide-react"

export default function APIKeysPage() {
  return (
    <div className="container mx-auto p-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">API Keys</h1>
          <p className="text-muted-foreground mt-1">Manage your API keys</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>API Key Security</CardTitle>
            <CardDescription>Your API keys are securely stored and hashed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-yellow-500/50 bg-yellow-500/10 p-4 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-400 mt-0.5" />
              <div>
                <p className="text-sm text-yellow-400 font-semibold mb-1">Important Security Note</p>
                <p className="text-sm text-yellow-400/90">
                  API keys are only shown once during agent registration. If you lose your API key, you'll need to
                  regenerate it. API keys are stored securely using bcrypt hashing.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-sm text-muted-foreground">
                To view or regenerate API keys, go to individual agent settings.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}

