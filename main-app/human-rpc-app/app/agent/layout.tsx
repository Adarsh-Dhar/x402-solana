"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from "@/components/ui/sidebar"
import { Bot, CreditCard, Key, Settings, Home } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const menuItems = [
  {
    title: "Overview",
    icon: Home,
    href: "/agent",
  },
  {
    title: "Agents",
    icon: Bot,
    href: "/agent/agents",
  },
  {
    title: "Billing",
    icon: CreditCard,
    href: "/agent/billing",
  },
  {
    title: "API Keys",
    icon: Key,
    href: "/agent/api-keys",
  },
  {
    title: "Settings",
    icon: Settings,
    href: "/agent/settings",
  },
]

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <SidebarProvider className="h-screen">
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--neon-green)]/10 border border-[var(--neon-green)]/30">
              <Bot className="h-4 w-4 text-[var(--neon-green)]" />
            </div>
            <div>
              <h1 className="font-mono text-sm font-bold text-foreground">
                Human<span className="text-[var(--neon-green)]">RPC</span>
              </h1>
              <p className="text-xs text-muted-foreground">Developer Console</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {menuItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || (item.href !== "/agent" && pathname?.startsWith(item.href))
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <Icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset className="flex flex-col h-full overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}

