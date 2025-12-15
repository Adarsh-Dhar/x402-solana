"use client"

import { Button } from "@/components/ui/button"
import { Wallet } from "lucide-react"

export default function MinimalRegisterPage() {
  console.log("[MinimalRegisterPage] RENDERING")
  
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-md w-full space-y-4">
        <h1 className="text-2xl font-bold text-center">Minimal Register Page</h1>
        
        <Button
          onClick={() => {
            console.log("[MinimalRegisterPage] Button 1 clicked")
            alert("Button 1 works!")
          }}
          className="w-full bg-green-500 hover:bg-green-600 text-white"
        >
          Test Button 1
        </Button>
        
        <Button
          onClick={() => {
            console.log("[MinimalRegisterPage] Button 2 clicked")
            alert("Button 2 works!")
          }}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white"
        >
          <Wallet className="mr-2 h-4 w-4" />
          Test Button 2 (with icon)
        </Button>
        
        <Button
          onClick={() => {
            console.log("[MinimalRegisterPage] Wallet test clicked")
            if (typeof window !== 'undefined' && (window as any).solana) {
              alert("Phantom wallet detected!")
            } else {
              alert("No Phantom wallet found")
            }
          }}
          className="w-full bg-purple-500 hover:bg-purple-600 text-white"
        >
          Test Phantom Detection
        </Button>
        
        <div className="text-sm text-gray-600 p-4 bg-gray-100 rounded">
          <p>If you can see this page and the buttons work, then:</p>
          <ul className="list-disc list-inside mt-2">
            <li>Next.js routing is working</li>
            <li>React components are rendering</li>
            <li>Button components are working</li>
            <li>The issue is with the complex register page</li>
          </ul>
        </div>
      </div>
    </div>
  )
}