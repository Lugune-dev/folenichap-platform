import { Routes } from '@angular/router';
import { guestGuard, roleGuard } from './core/guards';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/landing.component').then(m => m.LandingComponent) },
  { path: 'login', title: 'Ingia / Log in · FoleniChap', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent) },
  { path: 'forgot-password', title: 'Nenosiri / Reset password · FoleniChap', canActivate: [guestGuard], loadComponent: () => import('./features/auth/forgot-password.component').then(m => m.ForgotPasswordComponent) },
  { path: 'register', title: 'Sajili / Register · FoleniChap', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register.component').then(m => m.RegisterComponent) },

  // Zero-app customer experience
  { path: 'b/:slug', loadComponent: () => import('./features/public-booking/booking-page.component').then(m => m.BookingPageComponent) },
  { path: 'a/:token', loadComponent: () => import('./features/public-booking/appointment-page.component').then(m => m.AppointmentPageComponent) },
  { path: 't/:token', loadComponent: () => import('./features/public-booking/ticket-tracker.component').then(m => m.TicketTrackerComponent) },

  // Waiting room TV
  { path: 'tv/:slug', loadComponent: () => import('./features/tv-display/tv-board.component').then(m => m.TvBoardComponent) },

  // Reception / agents
  { path: 'desk', canActivate: [roleGuard('STAFF', 'TENANT_ADMIN')],
    loadComponent: () => import('./features/staff-desk/staff-desk.component').then(m => m.StaffDeskComponent) },

  // Business admin portal
  { path: 'admin', canActivate: [roleGuard('TENANT_ADMIN')],
    loadComponent: () => import('./features/admin-portal/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      { path: 'dashboard', loadComponent: () => import('./features/admin-portal/dashboard.component').then(m => m.DashboardComponent) },
      { path: 'appointments', loadComponent: () => import('./features/admin-portal/appointments.component').then(m => m.AppointmentsComponent) },
      { path: 'services', loadComponent: () => import('./features/admin-portal/services.component').then(m => m.ServicesComponent) },
      { path: 'staff', loadComponent: () => import('./features/admin-portal/staff.component').then(m => m.StaffComponent) },
      { path: 'branches', loadComponent: () => import('./features/admin-portal/branches.component').then(m => m.BranchesComponent) },
      { path: 'payments', loadComponent: () => import('./features/admin-portal/payments.component').then(m => m.PaymentsComponent) },
      { path: 'settings', loadComponent: () => import('./features/admin-portal/settings.component').then(m => m.SettingsComponent) }
    ] },

  // Platform owner
  { path: 'super', canActivate: [roleGuard('SUPER_ADMIN')],
    loadComponent: () => import('./features/super-admin/super-dashboard.component').then(m => m.SuperDashboardComponent) },

  { path: '**', redirectTo: '' }
];
