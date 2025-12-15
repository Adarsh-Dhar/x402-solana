/**
 * Multi-Phase Voting System Types
 * 
 * Defines the core types and interfaces for the multi-phase voting consensus mechanism
 */

import type { Task, User, PhaseTransition as PrismaPhaseTransition, VoterEligibility as PrismaVoterEligibility } from "@prisma/client"

/**
 * Voting phases enum representing the three-phase escalation process
 */
export enum VotingPhase {
  PHASE_1 = 1,
  PHASE_2 = 2,
  PHASE_3 = 3,
  TERMINATED = -1
}

/**
 * Result of a phase evaluation or initiation
 */
export interface PhaseResult {
  phase: VotingPhase
  voterCount: number
  consensusReached: boolean
  decision?: "yes" | "no"
  transitionRequired: boolean
}

/**
 * Phase transition information
 */
export interface PhaseTransition {
  fromPhase: VotingPhase
  toPhase?: VotingPhase
  reason: string
  timestamp: Date
}

/**
 * Metadata stored in the Task.phaseMeta JSON field
 */
export interface PhaseMeta {
  phase1Voters?: string[]
  phase2Voters?: string[]
  phase3Voters?: string[]
  phaseStartTimes: Record<VotingPhase, Date>
  phaseEndTimes: Record<VotingPhase, Date>
  voterNotifications: NotificationRecord[]
}

/**
 * Notification record for tracking voter communications
 */
export interface NotificationRecord {
  userId: string
  type: NotificationType
  phase: VotingPhase
  timestamp: Date
  delivered: boolean
  retryCount: number
}

/**
 * Types of notifications sent to voters
 */
export enum NotificationType {
  PHASE_SELECTION = "phase_selection",
  PHASE_TRANSITION = "phase_transition", 
  PHASE_OUTCOME = "phase_outcome",
  FINAL_DECISION = "final_decision"
}

/**
 * Enhanced Task interface with multi-phase voting capabilities
 */
export interface EnhancedTask extends Task {
  currentPhase: VotingPhase
  phaseMeta: PhaseMeta
  phaseHistory: PhaseTransition[]
}

/**
 * Voter pool information for a specific phase
 */
export interface VoterPool {
  voterIds: string[]
  eligibilityCriteria: string
  totalEligible: number
  selectedCount: number
}

/**
 * Leaderboard ranking information for voter selection
 */
export interface LeaderboardRanking {
  userId: string
  accuracy: number
  totalVotes: number
  rank: number
  percentile: number
}

/**
 * Comprehensive leaderboard metrics for a user
 */
export interface LeaderboardMetrics {
  userId: string
  totalVotes: number
  correctVotes: number
  accuracy: number
  recentAccuracy: number // Last 30 days
  consecutiveCorrect: number
  rank: number
  percentile: number
  lastUpdated: Date
}

/**
 * Phase manager interface for orchestrating voting phases
 */
export interface PhaseManager {
  initiatePhase(taskId: string, phase: VotingPhase): Promise<PhaseResult>
  evaluatePhaseCompletion(taskId: string): Promise<PhaseTransition>
  transitionToNextPhase(taskId: string): Promise<boolean>
  terminateVoting(taskId: string, reason: string): Promise<void>
}

/**
 * Voter pool selector interface for determining eligible voters
 */
export interface VoterPoolSelector {
  getPhaseEligibleVoters(phase: VotingPhase, requiredCount: number): Promise<VoterPool>
  calculateLeaderboardRankings(): Promise<LeaderboardRanking[]>
  getTopPercentileVoters(percentile: number): Promise<string[]>
}

/**
 * Phase notification service interface
 */
export interface PhaseNotificationService {
  notifyPhaseSelection(userId: string, phase: VotingPhase, leaderboardStatus: string): Promise<void>
  notifyPhaseTransition(voterIds: string[], transition: PhaseTransition): Promise<void>
  notifyPhaseOutcome(voterIds: string[], phase: VotingPhase, outcome: string): Promise<void>
  notifyFinalDecision(voterIds: string[], decision: "yes" | "no"): Promise<void>
}

/**
 * Phase audit logger interface
 */
export interface PhaseAuditLogger {
  logPhaseInitiation(taskId: string, phase: VotingPhase, voterCount: number, criteria: string): Promise<void>
  logPhaseTransition(taskId: string, transition: PhaseTransition, voterPoolChanges: string): Promise<void>
  logConsensusOutcome(taskId: string, phase: VotingPhase, decision: "yes" | "no", metrics: ConsensusMetrics): Promise<void>
  logConsensusFailure(taskId: string, reason: string, participationStats: ParticipationStats): Promise<void>
  logError(taskId: string, error: Error, context: Record<string, any>): Promise<void>
}

/**
 * Consensus metrics for logging
 */
export interface ConsensusMetrics {
  yesVotes: number
  noVotes: number
  totalVotes: number
  consensusPercentage: number
  threshold: number
}

/**
 * Participation statistics for failure logging
 */
export interface ParticipationStats {
  totalEligibleVoters: number
  actualVoters: number
  participationRate: number
  phaseBreakdown: Record<VotingPhase, number>
}

/**
 * Type guards for runtime type checking
 */
export function isValidVotingPhase(phase: number): phase is VotingPhase {
  return Object.values(VotingPhase).includes(phase as VotingPhase)
}

export function isPhaseMeta(obj: any): obj is PhaseMeta {
  return obj && 
    typeof obj === 'object' &&
    typeof obj.phaseStartTimes === 'object' &&
    typeof obj.phaseEndTimes === 'object' &&
    Array.isArray(obj.voterNotifications)
}

/**
 * Helper functions for phase management
 */
export function getNextPhase(currentPhase: VotingPhase): VotingPhase | null {
  switch (currentPhase) {
    case VotingPhase.PHASE_1:
      return VotingPhase.PHASE_2
    case VotingPhase.PHASE_2:
      return VotingPhase.PHASE_3
    case VotingPhase.PHASE_3:
    case VotingPhase.TERMINATED:
      return null
    default:
      return null
  }
}

export function getPhasePercentile(phase: VotingPhase): number {
  switch (phase) {
    case VotingPhase.PHASE_1:
      return 1.0 // All eligible voters (100%)
    case VotingPhase.PHASE_2:
      return 0.5 // Top 50%
    case VotingPhase.PHASE_3:
      return 0.1 // Top 10%
    default:
      return 0
  }
}

export function getPhaseDescription(phase: VotingPhase): string {
  switch (phase) {
    case VotingPhase.PHASE_1:
      return "General Voting (All Eligible Voters)"
    case VotingPhase.PHASE_2:
      return "Top 50% Leaderboard Voting"
    case VotingPhase.PHASE_3:
      return "Top 10% Leaderboard Voting"
    case VotingPhase.TERMINATED:
      return "Voting Terminated"
    default:
      return "Unknown Phase"
  }
}