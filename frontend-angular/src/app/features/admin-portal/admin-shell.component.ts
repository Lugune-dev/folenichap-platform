import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { API } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { dateTime } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { ProfileView } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';

@Component({
    selector: 'fc-admin-shell',
    imports: [RouterOutlet, RouterLink, RouterLinkActive, LangSwitchComponent, ThemeToggleComponent, LogoComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen lg:grid lg:grid-cols-[16.5rem_1fr]">
      <!-- Mobile top bar -->
      <header class="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-ink-200 bg-surface/90 px-3 backdrop-blur lg:hidden no-print">
        <button class="btn-icon" (click)="drawer.set(true)" [attr.aria-label]="L('Fungua menyu', 'Open menu')"><fc-icon name="menu" /></button>
        <a routerLink="/admin"><fc-logo [size]="26" /></a>
        <a routerLink="/desk" class="btn-icon" [attr.aria-label]="t('admin.desk')"><fc-icon name="desk" /></a>
      </header>

      <!-- Drawer backdrop (mobile) -->
      @if (drawer()) { <div class="fixed inset-0 z-40 bg-night-950/40 backdrop-blur-sm lg:hidden" (click)="drawer.set(false)" aria-hidden="true"></div> }

      <!-- Sidebar -->
      <aside class="fixed inset-y-0 left-0 z-50 flex w-[16.5rem] flex-col border-r border-ink-200 bg-surface transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 no-print"
        [class.-translate-x-full]="!drawer()" [class.translate-x-0]="drawer()" aria-label="Main">
        <div class="flex h-16 items-center justify-between px-5">
          <a routerLink="/admin"><fc-logo /></a>
          <button class="btn-icon -mr-2 lg:hidden" (click)="drawer.set(false)" [attr.aria-label]="t('common.close')"><fc-icon name="x" /></button>
        </div>

        @if (profile(); as p) {
          <div class="mx-3 mb-2 flex items-center gap-3 rounded-xl border border-ink-200 p-2.5">
            @if (p.logoUrl) { <img [src]="p.logoUrl" alt="" class="h-9 w-9 rounded-lg object-contain"> }
            @else { <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-sm font-bold text-white">{{ p.businessName.charAt(0) }}</span> }
            <div class="min-w-0"><p class="truncate text-sm font-semibold">{{ p.businessName }}</p><p class="truncate text-2xs text-ink-500">/b/{{ p.slug }}</p></div>
          </div>
        }

        <nav class="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
          <p class="px-3 pb-1.5 pt-2 text-2xs font-semibold uppercase tracking-wider text-ink-400">{{ L('Simamia', 'Manage') }}</p>
          @for (n of nav; track n.path) {
            <a [routerLink]="n.path" routerLinkActive="active" class="nav-link"><fc-icon [name]="n.icon" [size]="18" class="text-ink-400" />{{ t(n.key) }}</a>
          }
          <p class="px-3 pb-1.5 pt-5 text-2xs font-semibold uppercase tracking-wider text-ink-400">{{ L('Uendeshaji', 'Operate') }}</p>
          <a routerLink="/desk" class="nav-link"><fc-icon name="desk" [size]="18" class="text-ink-400" />{{ t('admin.desk') }}</a>
          @if (profile(); as p) {
            <a [href]="'/tv/' + p.slug" target="_blank" rel="noopener" class="nav-link"><fc-icon name="tv" [size]="18" class="text-ink-400" />{{ t('admin.tv') }}<fc-icon name="external" [size]="14" class="ml-auto text-ink-300" /></a>
            <a [href]="'/b/' + p.slug" target="_blank" rel="noopener" class="nav-link"><fc-icon name="qr" [size]="18" class="text-ink-400" />{{ L('Ukurasa wa wateja', 'Customer page') }}<fc-icon name="external" [size]="14" class="ml-auto text-ink-300" /></a>
          }
        </nav>

        <div class="space-y-3 border-t border-ink-100 p-3">
          @if (profile(); as p) {
            <a routerLink="settings" class="block rounded-xl p-3 transition hover:bg-ink-50" [class]="planCls()">
              <div class="flex items-center justify-between">
                <span class="text-xs font-semibold">{{ p.plan }}</span>
                <span class="text-2xs font-semibold uppercase tracking-wide">{{ statusLabel() }}</span>
              </div>
              @if (p.status === 'TRIAL') {
                <p class="mt-1 text-2xs">{{ t('plan.trialEnds') }}: {{ fmt(p.trialEndsAt) }}</p>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-white/70"><div class="h-full rounded-full bg-current" [style.width.%]="trialPct()"></div></div>
              }
              <p class="mt-1 text-2xs opacity-80">{{ t('plan.credits') }}: {{ p.smsCredits }}</p>
            </a>
          }
          <div class="flex items-center gap-2 px-1">
            <span class="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-700">{{ initials() }}</span>
            <div class="min-w-0 flex-1"><p class="truncate text-sm font-medium">{{ auth.user()?.fullName }}</p><p class="truncate text-2xs text-ink-500">{{ auth.user()?.email }}</p></div>
            <button class="btn-icon h-8 w-8" (click)="auth.logout()" [attr.aria-label]="t('common.logout')" [title]="t('common.logout')"><fc-icon name="logout" [size]="17" /></button>
          </div>
          <div class="flex items-center gap-2 px-1"><fc-theme-toggle /><fc-lang-switch /></div>
        </div>
      </aside>

      <div class="min-w-0">
        @if (profile()?.status === 'SUSPENDED' || profile()?.status === 'PAST_DUE') {
          <div class="flex items-center gap-3 border-b border-accent-200 bg-accent-50 px-4 py-3 text-sm text-accent-700 sm:px-8 no-print" role="alert">
            <fc-icon name="alert" [size]="18" />
            <span class="flex-1">{{ L('Usajili wako unahitaji malipo ili kuendelea kupokea wateja.', 'Your subscription needs payment to keep accepting customers.') }}</span>
            <a routerLink="/admin/settings" class="btn-sm btn bg-accent-600 text-white hover:bg-accent-700">{{ t('plan.upgrade') }}</a>
          </div>
        }
        <main class="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10"><router-outlet /></main>
      </div>
    </div>
  `
})
export class AdminShellComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmt = dateTime;
  protected readonly profile = signal<ProfileView | null>(null);
  protected readonly drawer = signal(false);
  protected readonly nav = [
    { path: 'dashboard', key: 'admin.dashboard', icon: 'dashboard' }, { path: 'appointments', key: 'admin.appointments', icon: 'calendar' },
    { path: 'services', key: 'admin.services', icon: 'services' },
    { path: 'staff', key: 'admin.staff', icon: 'users' }, { path: 'branches', key: 'admin.branches', icon: 'building' },
    { path: 'payments', key: 'admin.payments', icon: 'wallet' }, { path: 'settings', key: 'admin.settings', icon: 'settings' }
  ];

  protected readonly initials = computed(() =>
    (this.auth.user()?.fullName ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase());

  protected readonly statusLabel = computed(() => {
    const s = this.profile()?.status;
    const sw = this.i18n.isSw();
    switch (s) {
      case 'TRIAL': return sw ? 'Majaribio' : 'Trial';
      case 'ACTIVE': return sw ? 'Hai' : 'Active';
      case 'PAST_DUE': return sw ? 'Imechelewa' : 'Past due';
      case 'SUSPENDED': return sw ? 'Imesimamishwa' : 'Suspended';
      default: return s ?? '';
    }
  });
  protected readonly planCls = computed(() => {
    switch (this.profile()?.status) {
      case 'ACTIVE': return 'block rounded-xl bg-brand-50 p-3 text-brand-800 transition hover:bg-brand-100';
      case 'TRIAL': return 'block rounded-xl bg-sky-50 p-3 text-sky-800 transition hover:bg-sky-100';
      default: return 'block rounded-xl bg-accent-50 p-3 text-accent-700 transition hover:bg-accent-100';
    }
  });
  protected readonly trialPct = computed(() => {
    const end = this.profile()?.trialEndsAt;
    if (!end) return 0;
    const left = (new Date(end).getTime() - Date.now()) / 86_400_000;
    return Math.max(4, Math.min(100, (left / 14) * 100));
  });

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => this.drawer.set(false));
  }

  ngOnInit(): void {
    this.http.get<ProfileView>(`${API}/admin/profile`).subscribe(p => this.profile.set(p));
  }
}
