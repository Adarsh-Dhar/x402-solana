# Multi-Phase Voting Consensus Design Document

## Overview

The multi-phase voting consensus mechanism enhances the existing Human RPC voting system by implementing a three-phase escalation process when initial consensus cannot be reached. The system progressively narrows the voter pool to higher-performing participants, increasing the likelihood of achieving consensus while maintaining decision quality.

## Architecture

The system extends the existing task-based voting infrastructure with phase management capabilities. The architecture follows a state machine pattern where each phase represents a distinct voting state with specific voter eligibility criteria and transition conditions.

### Core Components

1. **Phase Manager**: Orchestrates transitions between voting phases
2. **Voter Pool Selector**: Determines eligible voters based on leaderboard rankings
3. **Consensus Evaluator**: Applies consistent consensus logic across all phases
4. **Notification Service**: Manages voter notifications and status updates
5. **Audit Logger**: Tracks phase transitions and voting outcomes

## Components and Interfaces

### Phase Manager Interface

```typescript
interface PhaseManager {
  initiatePhase(taskId: string, phase: VotingPhase): Promise<PhaseResult>
  evaluatePhaseCompletion(taskId: string): Promise<PhaseTransition>
  transitionToNextPhase(taskId: string): Promise<boolean>
  terminateVoting(taskId: string, reason: string): Promise<void>
}

interface PhaseResult {
  phase: VotingPhase
  voterCount: number
  consensusReached: boolean
  decision?: "yes" | "no"
  transitionRequired: boolean
}

interface PhaseTransition {
  fromPhase: VotingPhase
  toPhase?: VotingPhase
  reason: string
  timestamp: Date
}
```

### Voter Pool Selector Interface

```typescript
interface VoterPoolSelector {
  getPhaseEligibleVoters(phase: VotingPhase, requiredCount: number): Promise<VoterPool>
  calculateLeaderboardRankings(): Promise<LeaderboardRanking[]>
  getTopPercentileVoters(percentile: number): Promise<string[]>
}

interface VoterPool {
  voterIds: string[]
  eligibilityCriteria: string
  totalEligible: number
  selectedCount: number
}

interface LeaderboardRanking {
  userId: string
  accuracy: number
  totalVotes: number
  rank: number
  percentile: number
}
```

### Enhanced Task Model

```typescript
interface EnhancedTask extends Task {
  currentPhase: VotingPhase
  phaseMeta: PhaseMeta
  phaseHistory: PhaseTransition[]
}

interface PhaseMeta {
  phase1Voters?: string[]
  phase2Voters?: string[]
  phase3Voters?: string[]
  phaseStartTimes: Record<VotingPhase, Date>
  phaseEndTimes: Record<VotingPhase, Date>
  voterNotifications: NotificationRecord[]
}

enum VotingPhase {
  PHASE_1 = 1,
  PHASE_2 = 2,
  PHASE_3 = 3,
  TERMINATED = -1
}
```

## Data Models

### Database Schema Extensions

The existing Task model will be extended with phase-specific fields:

```sql
-- Add to existing Task table
ALTER TABLE "Task" ADD COLUMN "currentPhase" INTEGER DEFAULT 1;
ALTER TABLE "Task" ADD COLUMN "phaseMeta" JSONB;

-- New table for phase transitions
CREATE TABLE "PhaseTransition" (
  "id" TEXT PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "fromPhase" INTEGER NOT NULL,
  "toPhase" INTEGER,
  "reason" TEXT NOT NULL,
  "voterCount" INTEGER NOT NULL,
  "timestamp" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE
);

-- New table for voter eligibility tracking
CREATE TABLE "VoterEligibility" (
  "id" TEXT PRIMARY KEY,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "phase" INTEGER NOT NULL,
  "eligible" BOOLEAN NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
```

### Leaderboard Calculation Model

```typescript
interface LeaderboardMetrics {
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
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

After analyzing all acceptance criteria, several properties can be consolidated to eliminate redundancy:

- Properties 3.1-3.5 (notification behaviors) can be combined into comprehensive notification properties
- Properties 4.1-4.5 (logging behaviors) can be consolidated into comprehensive logging properties  
- Properties 5.1-5.5 (consistency requirements) can be merged into threshold and calculation consistency properties

### Core Properties

**Property 1: Phase transition progression**
*For any* task that fails to reach consensus in Phase 1, the system should automatically initiate Phase 2 with top 50% leaderboard voters, and if Phase 2 fails, initiate Phase 3 with top 10% leaderboard voters
**Validates: Requirements 1.1, 1.2**

**Property 2: Terminal consensus failure handling**
*For any* task that fails to reach consensus in Phase 3, the system should return a negative result indicating consensus failure
**Validates: Requirements 1.3**

**Property 3: Early consensus termination**
*For any* voting phase that reaches consensus, the system should immediately terminate the process and return the consensus result
**Validates: Requirements 1.4**

**Property 4: Voter pool filtering accuracy**
*For any* Phase 2 initiation, all selected voters should be in the top 50% of leaderboard rankings, and for Phase 3, all selected voters should be in the top 10% of leaderboard rankings
**Validates: Requirements 2.2, 2.3**

**Property 5: Leaderboard ranking consistency**
*For any* leaderboard calculation, rankings should be based solely on historical voting accuracy as the primary metric
**Validates: Requirements 2.4**

**Property 6: Comprehensive voter notifications**
*For any* voter selected for advanced phases, they should receive notifications about their leaderboard status, phase transitions, phase outcomes, and final consensus decisions
**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

**Property 7: Complete audit logging**
*For any* voting process, the system should log phase initiations with voter counts, phase transitions with reasons, consensus outcomes with metrics, and any errors with debugging context
**Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**

**Property 8: Consensus threshold consistency**
*For any* multi-phase voting process, the consensus threshold and calculation methods should remain identical across all phases
**Validates: Requirements 1.5, 5.1, 5.2, 5.3, 5.4, 5.5**

<function_calls>
<invoke name="prework">
<parameter name="featureName">multi-phase-voting-consensus

## Error Handling

### Phase Transition Errors

- **Insufficient Voters**: When a phase has fewer eligible voters than required, the system proceeds with available voters and logs the condition
- **Database Failures**: Phase transitions are wrapped in database transactions to ensure consistency
- **Notification Failures**: Failed notifications are queued for retry with exponential backoff
- **Consensus Calculation Errors**: Invalid vote data triggers error logging and task suspension

### Voter Eligibility Errors

- **Missing Leaderboard Data**: Users without voting history are excluded from advanced phases
- **Stale Rankings**: Leaderboard calculations are cached with TTL to prevent performance issues
- **Concurrent Modifications**: Voter selection uses database locks to prevent race conditions

### Recovery Mechanisms

- **Phase Rollback**: Failed phase transitions can be rolled back to the previous stable state
- **Manual Override**: System administrators can manually advance or terminate voting phases
- **Graceful Degradation**: System falls back to single-phase voting if multi-phase logic fails

## Testing Strategy

### Dual Testing Approach

The system requires both unit testing and property-based testing to ensure comprehensive coverage:

- **Unit tests** verify specific examples, edge cases, and error conditions
- **Property tests** verify universal properties that should hold across all inputs
- Together they provide comprehensive coverage: unit tests catch concrete bugs, property tests verify general correctness

### Unit Testing Requirements

Unit tests will cover:
- Specific phase transition scenarios with known voter pools
- Edge cases like insufficient voters or database failures
- Integration points between phase manager and existing consensus logic
- Notification delivery and retry mechanisms

### Property-Based Testing Requirements

The system will use **Hypothesis** (Python) for property-based testing with a minimum of 100 iterations per test. Each property-based test will be tagged with comments explicitly referencing the correctness property from this design document using the format: **Feature: multi-phase-voting-consensus, Property {number}: {property_text}**

Property-based tests will verify:
- Phase progression logic across randomly generated task scenarios
- Voter pool filtering with various leaderboard configurations  
- Consensus threshold consistency across all phases
- Notification delivery completeness for all voter combinations
- Audit logging completeness for all possible voting outcomes

### Test Data Generation

Smart generators will be implemented to:
- Create realistic leaderboard distributions with varying accuracy scores
- Generate task scenarios with different AI confidence levels and voter requirements
- Simulate network failures and database errors during phase transitions
- Create edge cases like ties in leaderboard rankings or simultaneous consensus

### Integration Testing

- End-to-end testing of complete multi-phase voting scenarios
- Performance testing with large voter pools and high concurrency
- Compatibility testing with existing single-phase voting logic
- Database migration testing for schema changes