/**
 * Phase Manager Implementation
 * 
 * Orchestrates multi-phase voting transitions and manages the consensus process
 * across three distinct phases with progressive voter pool refinement.
 */

import { prisma } from "@/lib/prisma"
import { checkConsensus } from "@/lib/consensus-checker"
import { 
  PhaseManager as IPhaseManager,
  PhaseResult,
  PhaseTransition,
  VotingPhase,
  PhaseMeta,
  EnhancedTask,
  getNextPhase, 
  getPhasePercentile, 
  getPhaseDescription 
} from "./types"

export class PhaseManager implements IPhaseManager {
  
  /**
   * Initiate a new voting phase for a task
   */
  async initiatePhase(taskId: string, phase: VotingPhase): Promise<PhaseResult> {
    try {
      console.log(`[PhaseManager] Initiating phase ${phase} for task ${taskId}`)
      
      // Get current task state
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          votes: true
        }
      })

      // Get voter eligibilities for this phase
      const voterEligibilities = await prisma.voterEligibility.findMany({
        where: { 
          taskId: taskId,
          phase: phase 
        }
      })

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      // Initialize or update phase metadata
      const currentPhaseMeta: any = task.phaseMeta || {
        phaseStartTimes: {},
        phaseEndTimes: {},
        voterNotifications: []
      }

      // Record phase start time
      currentPhaseMeta.phaseStartTimes[phase] = new Date()

      // Update task with new phase
      await prisma.task.update({
        where: { id: taskId },
        data: {
          currentPhase: phase,
          phaseMeta: currentPhaseMeta
        }
      })

      // Create phase transition record
      await prisma.phaseTransition.create({
        data: {
          taskId: taskId,
          fromPhase: phase === 1 ? 0 : phase - 1, // 0 represents initial state
          toPhase: phase,
          reason: `Initiated ${getPhaseDescription(phase)}`,
          voterCount: voterEligibilities.length,
          timestamp: new Date()
        }
      })

      // Check if consensus is already reached with current votes
      const consensusResult = checkConsensus(
        task.yesVotes,
        task.noVotes,
        task.requiredVoters || 3,
        parseFloat(task.consensusThreshold?.toString() || "0.51")
      )

      console.log(`[PhaseManager] Phase ${phase} initiated for task ${taskId}, consensus: ${consensusResult.reached}`)

      return {
        phase: phase,
        voterCount: voterEligibilities.length,
        consensusReached: consensusResult.reached,
        decision: consensusResult.decision || undefined,
        transitionRequired: false
      }

    } catch (error) {
      console.error(`[PhaseManager] Error initiating phase ${phase} for task ${taskId}:`, error)
      throw error
    }
  }

  /**
   * Evaluate if the current phase has completed and determine next action
   */
  async evaluatePhaseCompletion(taskId: string): Promise<PhaseTransition> {
    try {
      console.log(`[PhaseManager] Evaluating phase completion for task ${taskId}`)
      
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          votes: true
        }
      })

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      const currentPhase = task.currentPhase as VotingPhase
      const consensusResult = checkConsensus(
        task.yesVotes,
        task.noVotes,
        task.requiredVoters || 3,
        parseFloat(task.consensusThreshold?.toString() || "0.51")
      )

      // If consensus is reached, no transition needed
      if (consensusResult.reached) {
        return {
          fromPhase: currentPhase,
          toPhase: undefined, // No transition needed
          reason: `Consensus reached in ${getPhaseDescription(currentPhase)}: ${consensusResult.decision}`,
          timestamp: new Date()
        }
      }

      // Check if we have enough votes to evaluate consensus
      if (task.currentVoteCount < (task.requiredVoters || 3)) {
        return {
          fromPhase: currentPhase,
          toPhase: undefined, // Still waiting for votes
          reason: `Waiting for more votes in ${getPhaseDescription(currentPhase)} (${task.currentVoteCount}/${task.requiredVoters})`,
          timestamp: new Date()
        }
      }

      // No consensus reached and we have enough votes - need to transition
      const nextPhase = getNextPhase(currentPhase)
      
      if (nextPhase === null) {
        // We're in Phase 3 and no consensus - voting fails
        return {
          fromPhase: currentPhase,
          toPhase: VotingPhase.TERMINATED,
          reason: `No consensus reached after ${getPhaseDescription(currentPhase)} - voting terminated`,
          timestamp: new Date()
        }
      }

      return {
        fromPhase: currentPhase,
        toPhase: nextPhase,
        reason: `No consensus in ${getPhaseDescription(currentPhase)} - transitioning to ${getPhaseDescription(nextPhase)}`,
        timestamp: new Date()
      }

    } catch (error) {
      console.error(`[PhaseManager] Error evaluating phase completion for task ${taskId}:`, error)
      throw error
    }
  }

  /**
   * Transition to the next voting phase
   */
  async transitionToNextPhase(taskId: string): Promise<boolean> {
    try {
      console.log(`[PhaseManager] Transitioning to next phase for task ${taskId}`)
      
      const phaseTransition = await this.evaluatePhaseCompletion(taskId)
      
      // If no transition is needed, return false
      if (!phaseTransition.toPhase) {
        console.log(`[PhaseManager] No transition needed for task ${taskId}: ${phaseTransition.reason}`)
        return false
      }

      // If transitioning to TERMINATED, handle voting failure
      if (phaseTransition.toPhase === VotingPhase.TERMINATED) {
        await this.terminateVoting(taskId, phaseTransition.reason)
        return true
      }

      // Get current task state
      const task = await prisma.task.findUnique({
        where: { id: taskId }
      })

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      // Update phase metadata
      const currentPhaseMeta: any = task.phaseMeta || {
        phaseStartTimes: {},
        phaseEndTimes: {},
        voterNotifications: []
      }

      // Record end time for current phase and start time for next phase
      currentPhaseMeta.phaseEndTimes[phaseTransition.fromPhase] = new Date()
      currentPhaseMeta.phaseStartTimes[phaseTransition.toPhase] = new Date()

      // Reset vote counts for the new phase
      await prisma.task.update({
        where: { id: taskId },
        data: {
          currentPhase: phaseTransition.toPhase,
          phaseMeta: currentPhaseMeta,
          yesVotes: 0,
          noVotes: 0,
          currentVoteCount: 0
        }
      })

      // Clear existing votes for the new phase (votes are phase-specific)
      await prisma.vote.deleteMany({
        where: { taskId: taskId }
      })

      // Record the phase transition
      await prisma.phaseTransition.create({
        data: {
          taskId: taskId,
          fromPhase: phaseTransition.fromPhase,
          toPhase: phaseTransition.toPhase,
          reason: phaseTransition.reason,
          voterCount: 0, // Will be updated when voters are selected
          timestamp: new Date()
        }
      })

      console.log(`[PhaseManager] Successfully transitioned task ${taskId} from phase ${phaseTransition.fromPhase} to ${phaseTransition.toPhase}`)
      return true

    } catch (error) {
      console.error(`[PhaseManager] Error transitioning to next phase for task ${taskId}:`, error)
      throw error
    }
  }

  /**
   * Terminate voting process due to consensus failure
   */
  async terminateVoting(taskId: string, reason: string): Promise<void> {
    try {
      console.log(`[PhaseManager] Terminating voting for task ${taskId}: ${reason}`)
      
      const task = await prisma.task.findUnique({
        where: { id: taskId }
      })

      if (!task) {
        throw new Error(`Task ${taskId} not found`)
      }

      // Update phase metadata
      const currentPhaseMeta: any = task.phaseMeta || {
        phaseStartTimes: {},
        phaseEndTimes: {},
        voterNotifications: []
      }

      // Record end time for current phase
      const currentPhase = task.currentPhase as VotingPhase
      currentPhaseMeta.phaseEndTimes[currentPhase] = new Date()

      // Update task status to failed consensus
      await prisma.task.update({
        where: { id: taskId },
        data: {
          currentPhase: VotingPhase.TERMINATED,
          phaseMeta: currentPhaseMeta,
          status: "failed",
          result: {
            consensus: "failed",
            reason: reason,
            finalPhase: currentPhase,
            terminatedAt: new Date().toISOString(),
            finalVotes: {
              yes: task.yesVotes,
              no: task.noVotes
            }
          }
        }
      })

      // Record the termination
      await prisma.phaseTransition.create({
        data: {
          taskId: taskId,
          fromPhase: currentPhase,
          toPhase: VotingPhase.TERMINATED,
          reason: reason,
          voterCount: task.currentVoteCount,
          timestamp: new Date()
        }
      })

      console.log(`[PhaseManager] Successfully terminated voting for task ${taskId}`)

    } catch (error) {
      console.error(`[PhaseManager] Error terminating voting for task ${taskId}:`, error)
      throw error
    }
  }

  /**
   * Get the current phase information for a task
   */
  async getCurrentPhaseInfo(taskId: string): Promise<{ phase: VotingPhase; description: string; percentile: number } | null> {
    try {
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { currentPhase: true }
      })

      if (!task) {
        return null
      }

      const phase = task.currentPhase as VotingPhase
      return {
        phase: phase,
        description: getPhaseDescription(phase),
        percentile: getPhasePercentile(phase)
      }

    } catch (error) {
      console.error(`[PhaseManager] Error getting phase info for task ${taskId}:`, error)
      return null
    }
  }

  /**
   * Check if a task should transition phases after a new vote
   */
  async checkForPhaseTransition(taskId: string): Promise<boolean> {
    try {
      const phaseTransition = await this.evaluatePhaseCompletion(taskId)
      
      // If a transition is needed and it's not just waiting for votes
      if (phaseTransition.toPhase !== undefined) {
        return await this.transitionToNextPhase(taskId)
      }

      return false
    } catch (error) {
      console.error(`[PhaseManager] Error checking for phase transition for task ${taskId}:`, error)
      return false
    }
  }
}

// Export singleton instance
export const phaseManager = new PhaseManager()