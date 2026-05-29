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

export interface ClinicDashboardKpis {
  patientsTotal: number;
  queueWaiting: number;
  queueServing: number;
  queueCompletedToday: number;
  queueTotalToday: number;
  appointmentsToday: number;
  appointmentsArrivedToday: number;
  appointmentsScheduledToday: number;
}

export interface ClinicDashboardStats {
  scope: 'clinic';
  clinicId: string;
  generatedAt: string;
  today: string;
  kpis: ClinicDashboardKpis;
  queueLast7Days: QueueDaySeriesPoint[];
  appointmentsLast7Days: AppointmentDaySeriesPoint[];
  queueStatusToday: StatusCount[];
  appointmentStatusToday: StatusCount[];
  appointmentsBySlotToday: SlotUtilization[];
}

export interface ClinicOverviewRow {
  clinicId: string;
  name: string;
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
}

export type DashboardStatsResponse =
  | ClinicDashboardStats
  | PlatformDashboardStats;

/** @deprecated Use ClinicDashboardStats */
export type DashboardStats = Omit<ClinicDashboardStats, 'scope' | 'clinicId'>;
