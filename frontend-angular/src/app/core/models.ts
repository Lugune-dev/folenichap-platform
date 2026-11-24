export type Lang = 'sw' | 'en';
export type Role = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF';
export type TicketStatus = 'WAITING' | 'CALLED' | 'SERVING' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'WAIVED';
export type MobileProvider = 'MPESA' | 'TIGOPESA' | 'AIRTEL' | 'HALOPESA' | 'AZAMPESA';

export interface UserView {
  id: string; fullName: string; email: string; role: Role; tenantId?: string; tenantSlug?: string;
  businessName?: string; branchId?: string; counterLabel?: string; language: Lang; plan?: string;
  subscriptionStatus?: string;
}

export interface TokenResponse { accessToken: string | null; refreshToken: string | null; expiresIn: number; user: UserView; }

export interface PublicService {
  id: string; name: string; nameSw?: string; description?: string; ticketPrefix: string; avgDurationMinutes: number;
  feeAmount: number; currency: string; requireUpfrontPayment: boolean; waitingCount: number; estimatedWaitMinutes: number;
  allowAppointments: boolean;
}
export interface PublicBranch { id: string; name: string; address?: string; main: boolean; }
export interface PublicTenant {
  slug: string; businessName: string; logoUrl?: string; greetingEn?: string; greetingSw?: string; defaultLanguage: Lang;
  acceptingTickets: boolean; paymentsEnabled: boolean; branchId: string; branches: PublicBranch[];
  services: PublicService[]; waitingCount: number; acceptingAppointments: boolean;
}

export interface TicketStatusView {
  trackingToken: string; ticketNumber: string; status: TicketStatus; paymentStatus: PaymentStatus; serviceName: string;
  serviceNameSw?: string; businessName: string; tenantSlug: string; branchId: string; branchName: string;
  peopleAhead: number; estimatedWaitMinutes: number; counterLabel?: string; joinedAt: string; calledAt?: string;
  feeAmount: number; currency: string; requireUpfrontPayment: boolean; paymentMessage?: string;
}

export interface BoardTicket { ticketNumber: string; serviceName?: string; serviceNameSw?: string; counterLabel?: string; status: TicketStatus; calledAt?: string; recallCount: number; }
export interface BoardServiceStat { serviceId: string; name: string; nameSw?: string; prefix: string; waiting: number; estimatedWaitMinutes: number; }
export interface BoardSnapshot {
  branchId: string; branchName: string; businessName: string; generatedAt: string; nowServing: BoardTicket[];
  upNext: string[]; waitingCount: number; services: BoardServiceStat[]; lastCalled?: BoardTicket; lastEvent?: string;
}

export interface StaffTicket {
  id: string; ticketNumber: string; status: TicketStatus; paymentStatus: PaymentStatus; serviceId: string; serviceName?: string;
  customerName: string; customerPhone: string; language: Lang; source: string; counterLabel?: string; servedByUserId?: string;
  joinedAt: string; calledAt?: string; serviceStartedAt?: string; completedAt?: string; recallCount: number;
  requireUpfrontPayment: boolean; feeAmount?: number; version: number;
}
export interface TodayQueue {
  branchId: string; queueDate: string; waiting: StaffTicket[]; called: StaffTicket[]; serving: StaffTicket[];
  completed: StaffTicket[]; noShow: StaffTicket[]; cancelled: StaffTicket[];
}

export interface ServiceView {
  id: string; name: string; nameSw?: string; description?: string; ticketPrefix: string; avgDurationMinutes: number;
  feeAmount: number; currency: string; requireUpfrontPayment: boolean; sortOrder: number; active: boolean;
  allowAppointments: boolean; slotCapacity: number;
}

export interface StaffView {
  id: string; fullName: string; email: string; phone?: string; role: Role; branchId?: string; counterLabel?: string;
  language: Lang; active: boolean; lastLoginAt?: string;
}

export type DayHours = Record<string, { open: string; close: string }>;
export interface BranchView { id: string; name: string; address?: string; phone?: string; operatingHours: DayHours; main: boolean; active: boolean; }

export interface ProfileView {
  id: string; businessName: string; slug: string; phone: string; email: string; businessCategory?: string; logoUrl?: string;
  greetingEn?: string; greetingSw?: string; defaultLanguage: Lang; timezone: string; plan: string; effectivePlan: string;
  status: string; trialEndsAt: string; currentPeriodEndsAt?: string; smsCredits: number; publicUrl: string;
  maxBranches: number; maxStaff: number;
}

export interface PaymentView {
  id: string; ticketId?: string; type: string; provider: string; gateway: string; msisdn?: string; reference: string;
  providerTransactionId?: string; amount: number; currency: string; status: 'PENDING' | 'SUCCESS' | 'FAILED';
  failureReason?: string; paidAt?: string; createdAt: string;
}
export interface Page<T> { items: T[]; page: number; size: number; total: number; }

export interface Dashboard {
  summary: {
    from: string; to: string; totalTickets: number; completed: number; noShows: number; cancelled: number; waitingNow: number;
    inServiceNow: number; avgWaitMinutes?: number; avgServiceMinutes?: number; noShowRate?: number; revenue: number; paidTickets: number;
  };
  daily: { date: string; tickets: number; completed: number; noShows: number; avgWaitMinutes?: number; revenue: number }[];
  peakHours: { isoDow: number; hour: number; tickets: number }[];
  staff: { userId: string; fullName: string; counterLabel?: string; served: number; avgServiceMinutes?: number; avgWaitMinutes?: number }[];
  services: { serviceId: string; name: string; prefix: string; tickets: number; completed: number; avgWaitMinutes?: number; avgServiceMinutes?: number; revenue: number }[];
}

export interface TenantSummary {
  id: string; businessName: string; slug: string; email: string; phone: string; plan: string; status: string;
  trialEndsAt: string; currentPeriodEndsAt?: string; smsCredits: number; createdAt: string; ticketsLast30d: number; staffCount: number;
}
export interface PlatformMetrics {
  totalTenants: number; activeTenants: number; trialTenants: number; suspendedTenants: number; pendingApproval: number;
  mrr: number; collectedLast30d: number; ticketsToday: number; ticketsLast30d: number; totalSmsCredits: number;
  liveConnections: number; paymentGateway: string; payments24h: number; paymentsFailed24h: number; lastWebhookAt?: string;
}

export type AppointmentStatus = 'BOOKED' | 'CHECKED_IN' | 'CANCELLED' | 'NO_SHOW';
export interface SlotView { start: string; end: string; remaining: number; available: boolean; }
export interface DaySlots {
  date: string; branchId: string; serviceId: string; durationMinutes: number; firstBookableDate: string;
  lastBookableDate: string; slots: SlotView[];
}
export interface PublicAppointment {
  manageToken: string; status: AppointmentStatus; businessName: string; tenantSlug: string; branchId: string; branchName: string;
  branchAddress?: string; serviceId: string; serviceName: string; serviceNameSw?: string; customerName: string;
  customerPhoneMasked: string; startAt: string; endAt: string; checkInOpensAt: string; checkInClosesAt: string;
  canCheckIn: boolean; canCancel: boolean; ticketTrackingToken?: string; ticketNumber?: string; feeAmount: number;
  currency: string; requireUpfrontPayment: boolean;
}
export interface StaffAppointment {
  id: string; status: AppointmentStatus; source: 'WEB' | 'STAFF'; branchId: string; serviceId: string; serviceName?: string;
  servicePrefix?: string; customerName: string; customerPhone: string; language: Lang; startAt: string; endAt: string;
  notes?: string; ticketId?: string; ticketNumber?: string; checkedInAt?: string; manageToken: string;
}
export interface CheckInResult { ticketTrackingToken: string; ticketNumber: string; appointment: StaffAppointment; }

export interface ApiProblem { status: number; code?: string; detail?: string; errors?: Record<string, string>; }
