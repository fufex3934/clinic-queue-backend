export interface DaySeriesPoint {
  date: string;
  label: string;
  total: number;
}

export interface QueueDaySeriesPoint extends DaySeriesPoint {
  completed: number;
}

export interface AppointmentDaySeriesPoint extends DaySeriesPoint {
  arrived: number;
  cancelled: number;
}

export interface StatusCount {
  status: string;
  label: string;
  count: number;
}

export interface SlotUtilization {
  slot: string;
  count: number;
  capacity: number;
}

export interface SlotCount {
  slot: string;
  count: number;
}

export interface ClinicDashboardKpis {
  patientsTotal: number;
  patientsCreatedToday: number;
  queueWaiting: number;
  queueServing: number;
  queueCompletedToday: number;
  queueTotalToday: number;
  appointmentsToday: number;
  appointmentsArrivedToday: number;
  appointmentsScheduledToday: number;
  averageWaitMinutes: number | null;
}

export interface ClinicDashboardStats {
  scope: 'clinic';
  clinicId: string;
  generatedAt: string;
  today: string;
  /** IANA timezone used for "today" and day-bound KPIs */
  timezone: string;
  kpis: ClinicDashboardKpis;
  queueLast7Days: QueueDaySeriesPoint[];
  appointmentsLast7Days: AppointmentDaySeriesPoint[];
  queueStatusToday: StatusCount[];
  appointmentStatusToday: StatusCount[];
  appointmentsBySlotToday: SlotUtilization[];
  peakHoursToday: SlotCount[];
}

export interface ClinicOverviewRow {
  clinicId: string;
  name: string;
  isActive: boolean;
  patientsTotal: number;
  queueWaiting: number;
  queueTotalToday: number;
  appointmentsToday: number;
}

export interface PlatformDashboardKpis {
  clinicsTotal: number;
  patientsTotal: number;
  staffTotal: number;
  queueWaiting: number;
  queueServing: number;
  queueCompletedToday: number;
  appointmentsToday: number;
  appointmentsArrivedToday: number;
}

export interface PlatformDashboardStats {
  scope: 'platform';
  generatedAt: string;
  today: string;
  kpis: PlatformDashboardKpis;
  clinicsOverview: ClinicOverviewRow[];
  queueLast7Days: QueueDaySeriesPoint[];
  appointmentsLast7Days: AppointmentDaySeriesPoint[];
  queueStatusToday: StatusCount[];
  appointmentStatusToday: StatusCount[];
  clinicsGrowth: DaySeriesPoint[];
}

export type DashboardStatsResponse =
  | ClinicDashboardStats
  | PlatformDashboardStats;

/** @deprecated Use ClinicDashboardStats */
export type DashboardStats = Omit<ClinicDashboardStats, 'scope' | 'clinicId'>;
