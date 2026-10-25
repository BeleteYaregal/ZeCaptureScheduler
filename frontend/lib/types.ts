// Sales managers are team groups; supervisors sign in to book their own team.
export type Role = 'admin' | 'sales' | 'videographer' | 'supervisor';
export type BookingStatus = 'planned' | 'done' | 'missed' | 'rescheduled' | 'requested';

export interface User {
  id: number;
  name: string;
  username: string;
  role: Role;
  phone: string | null;
  supervisorId: number | null;
  active?: boolean;
}

export interface Settings {
  max_team_size: number;
  supervisor_max_per_day: number;
  sales_days_per_week: number;
  company_days_per_week: number;
  people_per_sales_day: number | null;
  slot_minutes: number;
  day_start_time: string;
  overdue_days: number;
}

export interface BookingView {
  id: number;
  slotOrder: number;
  startTime: string;
  status: BookingStatus;
  editDone: boolean;
  requested?: boolean;
  requestedById?: number | null;
  person: {
    id: number;
    name: string;
    phone: string | null;
    supervisorId: number | null;
    supervisorName: string | null;
    managerId: number | null;
    managerName: string | null;
  };
}

export interface DayView {
  id: number;
  date: string;
  type: 'sales' | 'company';
  status: 'active' | 'cancelled';
  startTime: string;
  note: string | null;
  videographer: { id: number; name: string } | null;
  capacity: number | null;
  load?: number;
  mine?: number;
  bookings: BookingView[];
}

export interface WeekView {
  week: {
    weekStart: string;
    weekEnd: string;
    status: 'none' | 'unpublished' | 'draft' | 'published';
    videographerId: number | null;
    videographerName: string | null;
    publishedAt: string | null;
  };
  limits: { salesDays: number; companyDays: number; maxTeamSize: number; supervisorMaxPerDay: number };
  days: DayView[];
  unscheduled: { id: number; name: string; supervisorName: string | null }[];
  warnings: string[];
  stats: { salesDays: number; companyDays: number; booked: number; planned: number; done: number; missed: number };
}

export interface SalesNode {
  id: number;
  name: string;
  username?: string;
  phone: string | null;
  active: boolean;
  lastCaptured: string | null;
  next: { date: string; startTime: string } | null;
}
export interface SupNode {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
  managerId: number;
  teamSize: number;
  max: number;
  login?: { id: number; username: string } | null;
  sales: SalesNode[];
}
export interface ManagerNode {
  id: number;
  name: string;
  phone: string | null;
  active: boolean;
  supervisors: SupNode[];
}
export interface OrgView {
  max: number;
  managers: ManagerNode[];
  unassignedSales: SalesNode[];
  videographers: { id: number; name: string; username: string; phone: string | null; active: boolean }[];
}

export interface Dashboard {
  today: string;
  editing: { captured: number; edited: number; pending: number; rate: number };
  totals: { sales: number; supervisors: number; managers: number; videographers: number };
  thisWeek: { weekStart: string; status: string; salesDays: number; companyDays: number; planned: number; done: number; missed: number };
  overdueDays: number;
  overdueCount: number;
  overdue: { id: number; name: string; supervisorName: string | null; lastCaptured: string | null; daysSince: number | null }[];
  coverage: { supervisorId: number; name: string; managerName: string | null; teamSize: number; max: number; upToDate: number }[];
  history: { weekStart: string; done: number; missed: number }[];
  missedRecent: { bookingId: number; name: string; date: string }[];
  upcoming: { id: number; date: string; type: 'sales' | 'company'; startTime: string; bookings: number; weekStatus: string }[];
}

export interface NotificationItem {
  id: number;
  title: string;
  body: string;
  read: boolean;
  at: string;
}

export interface ReportRow {
  id: number;
  date: string;
  time: string;
  person: string;
  supervisor: string;
  manager: string;
  status: 'planned' | 'done' | 'missed';
  editing: 'edited' | 'pending' | 'na';
  editedOn: string | null;
  videographer: string;
}
export interface ReportSummary {
  total: number;
  booked: number;
  captured: number;
  missed: number;
  edited: number;
  pendingEdit: number;
  captureRate: number;
  editRate: number;
}
export interface ReportResult {
  filters: { from: string; to: string };
  summary: ReportSummary;
  rows: ReportRow[];
}
