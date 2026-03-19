export interface BudgetReservationResult {
  reserved: boolean;
  reservationId?: string;
  error?: string;
}

export interface AgentDailyUsage {
  protocolId: string;
  agentAddress: string;
  date: string;
  committedUSD: number;
  reservedUSD: number;
  totalUSD: number;
  txCount: number;
  maxDailyBudget: number;
  remainingUSD: number;
}

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: string;
  currentSpendUSD?: number;
  maxDailyBudget?: number;
}
