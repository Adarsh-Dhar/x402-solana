import type { PrismaClient } from "@prisma/client"

/**
 * Compute leaderboard-based eligibility for later consensus phases.
 *
 * Phase 1: no restrictions (returns null).
 * Phase 2: top half of users (n/2, or (n-1)/2 if n is odd), including ties at the cutoff.
 * Phase 3: top 10% of users (at least 1), including ties at the cutoff.
 */
export async function getEligibleUserIdsForPhase(
  prisma: PrismaClient,
  phase: number
): Promise<Set<string> | null> {
  if (phase <= 1) {
    return null
  }

  const prismaAny = prisma as any
  const users: { id: string; points: number }[] = await prismaAny.user.findMany({
    orderBy: [
      { points: "desc" },
      { createdAt: "asc" },
    ],
    select: {
      id: true,
      points: true,
    },
  })

  const n = users.length
  if (n === 0) {
    return new Set()
  }

  let baseCount = 0

  if (phase === 2) {
    baseCount = n % 2 === 0 ? n / 2 : (n - 1) / 2
  } else if (phase === 3) {
    baseCount = Math.floor(0.1 * n)
    if (baseCount < 1) baseCount = 1
  } else {
    // Unknown future phase – treat as unrestricted for now
    return null
  }

  if (baseCount > n) {
    baseCount = n
  }

  let cutoffIndex = baseCount - 1
  const cutoffPoints = users[cutoffIndex].points

  // Extend cutoff to include all ties
  while (cutoffIndex + 1 < n && users[cutoffIndex + 1].points === cutoffPoints) {
    cutoffIndex++
  }

  const eligible = new Set<string>()
  for (let i = 0; i <= cutoffIndex; i++) {
    eligible.add(users[i].id)
  }

  return eligible
}


