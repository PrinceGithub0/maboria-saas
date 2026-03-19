export type DateRangeKey = "today" | "7d" | "30d" | "custom";

export type SystemState = "stable" | "degraded" | "critical";

export type TimelineStatus = "success" | "warning" | "failed" | "info";

export interface DashboardDateRange {
  key: DateRangeKey;
  from: string;
  to: string;
  label: string;
  query: {
    range: DateRangeKey;
    from?: string;
    to?: string;
  };
}

export interface TrendPoint {
  label: string;
  value: number;
}

export interface TimelineEntry {
  id: string;
  status: TimelineStatus;
  title: string;
  customer?: string | null;
  invoice?: string | null;
  timestamp: string;
  durationMs?: number | null;
  canRetry?: boolean;
  runId?: string | null;
}

export interface InfrastructureDashboardPayload {
  dateRange: DashboardDateRange;
  generatedAt: string;
  commandStrip: {
    state: SystemState;
    activeAutomations: number;
    failedRuns: number;
    queueStatus: "Low" | "Moderate" | "High";
    averageExecutionMs: number | null;
    lastUpdated: string;
  };
  alertStrip: {
    mode: "ok" | "warning";
    items: string[];
  };
  primary: {
    successRate: number;
    runsToday: number;
    failuresToday: number;
    averageDurationMs: number | null;
    trend: TrendPoint[];
    summary: string;
  };
  modules: {
    automation: {
      active: number;
      paused: number;
      failedRuns: number;
    };
    billing?: {
      revenue: number;
      currency: string;
      invoicesSent: number;
      invoicesOverdue: number;
      paymentSuccessRate: number;
    };
    infrastructure?: {
      webhookStatus: "Healthy" | "Degraded";
      messagingStatus: "Healthy" | "Degraded";
      apiLatencyMs: number | null;
      errorRate: number;
    };
  };
  timeline: TimelineEntry[];
  permissions: {
    canViewBilling: boolean;
    canViewInfrastructure: boolean;
  };
}
