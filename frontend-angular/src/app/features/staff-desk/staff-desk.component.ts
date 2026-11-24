import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable, Subject, debounceTime, interval } from 'rxjs';
import { API, toProblem } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { minutesSince, money, time } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { CheckInResult, ServiceView, StaffAppointment, StaffTicket, TodayQueue } from '../../core/models';
import { ConnectionState, SseService } from '../../core/sse.service';
import { ToastService } from '../../core/toast.service';
import { PayBadgeComponent, StatusBadgeComponent } from '../../shared/badges.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';
import { IconComponent } from '../../shared/icon.component';

/** Reception & agent control panel. Keyboard: N call next · R recall · S start · C complete. */
@Component({
    selector: 'fc-staff-desk',
    imports: [FormsModule, RouterLink, StatusBadgeComponent, PayBadgeComponent, LangSwitchComponent, ThemeToggleComponent, LogoComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen">
      <header class="sticky top-0 z-20 border-b border-ink-200 bg-surface/90 backdrop-blur no-print">
        <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <fc-logo [compact]="true" />
          <div class="hidden min-w-0 sm:block"><p class="truncate text-sm font-semibold">{{ auth.user()?.businessName }}</p>
            <p class="flex items-center gap-1.5 text-2xs font-medium" [class.text-brand-700]="conn() === 'live'" [class.text-accent-600]="conn() !== 'live'">
              <span class="h-1.5 w-1.5 rounded-full" [class]="conn() === 'live' ? 'bg-brand-500' : 'bg-accent-400 animate-pulse'"></span>{{ conn() === 'live' ? t('track.live') : L('Inaunganisha…', 'Reconnecting…') }}</p></div>
          <div class="ml-auto flex items-center gap-2">
            <label class="hidden text-xs font-medium text-ink-500 md:block" for="counter">{{ t('desk.counter') }}</label>
            <input id="counter" class="input h-9 w-32 text-sm" [(ngModel)]="counter" (change)="saveCounter()" [placeholder]="t('desk.counter')">
            <fc-theme-toggle /><fc-lang-switch />
            @if (auth.role() === 'TENANT_ADMIN') { <a routerLink="/admin" class="btn-ghost hidden sm:inline-flex"><fc-icon name="dashboard" [size]="16" />Admin</a> }
            <button class="btn-icon" (click)="auth.logout()" [attr.aria-label]="t('common.logout')" [title]="t('common.logout')"><fc-icon name="logout" [size]="18" /></button>
          </div>
        </div>
      </header>

      <div class="mx-auto grid max-w-7xl gap-5 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
        <div class="space-y-5">
          <!-- Current customer -->
          <section class="card overflow-hidden">
            <div class="card-header flex-wrap">
              <h2 class="card-title">{{ t('desk.current') }}</h2>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="mr-1 text-xs text-ink-500">{{ t('desk.filter') }}</span>
                <button class="chip ring-1 ring-inset transition" [class]="filter().length === 0 ? 'bg-brand-700 text-white ring-brand-700' : 'bg-surface text-ink-600 ring-ink-200 hover:ring-ink-300'" (click)="filter.set([])">{{ t('desk.all') }}</button>
                @for (s of services(); track s.id) {
                  <button class="chip ring-1 ring-inset transition" [class]="filter().includes(s.id) ? 'bg-brand-700 text-white ring-brand-700' : 'bg-surface text-ink-600 ring-ink-200 hover:ring-ink-300'" (click)="toggleFilter(s.id)">
                    <span class="font-mono">{{ s.ticketPrefix }}</span>{{ i18n.pick(s.nameSw, s.name) }}</button>
                }
              </div>
            </div>

            <div class="card-pad">
              @if (mine(); as c) {
                <div class="animate-fade-up rounded-2xl bg-night-950 p-6 text-white">
                  <div class="flex flex-wrap items-start gap-6">
                    <div class="min-w-0">
                      <div class="flex gap-2"><fc-status-badge [status]="c.status" /> @if (c.feeAmount) { <fc-pay-badge [status]="c.paymentStatus" /> }</div>
                      <p class="mt-3 text-6xl font-black leading-none tracking-tight tabular">{{ c.ticketNumber }}</p>
                      <p class="mt-3 text-lg font-semibold">{{ c.customerName }}</p>
                      <p class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-night-300">
                        <span>{{ c.serviceName }}</span><span class="flex items-center gap-1"><fc-icon name="clock" [size]="14" />{{ waitedLabel(c) }}</span>
                        @if (c.customerPhone) { <a class="flex items-center gap-1 underline-offset-2 hover:underline" [href]="'tel:+' + c.customerPhone"><fc-icon name="phone" [size]="14" />+{{ c.customerPhone }}</a> }
                      </p>
                    </div>
                  </div>
                  @if (blocked(c)) {
                    <div class="mt-5 flex flex-wrap items-center gap-2 rounded-xl bg-accent-400/15 p-3 text-sm text-accent-200">
                      <fc-icon name="alert" [size]="16" /><span class="flex-1">{{ i18n.error('PAYMENT_REQUIRED') }}</span>
                      <button class="btn-sm btn bg-surface text-ink hover:bg-ink-100" (click)="override(c, 'PAID_CASH')"><fc-icon name="banknote" [size]="14" />{{ t('desk.cash') }}</button>
                      <button class="btn-sm btn bg-white/10 text-white hover:bg-white/20" (click)="override(c, 'WAIVED')">{{ t('desk.waive') }}</button>
                    </div>
                  }
                  <div class="mt-5 flex flex-wrap gap-2">
                    @if (c.status === 'CALLED') {
                      <button class="btn bg-brand-500 text-white hover:bg-brand-400" [disabled]="blocked(c)" (click)="act(c, 'start')"><fc-icon name="play" [size]="16" />{{ t('desk.start') }}<span class="kbd ml-1 border-white/20 bg-white/10 text-white">S</span></button>
                      <button class="btn bg-white/10 text-white hover:bg-white/20" (click)="act(c, 'recall')"><fc-icon name="megaphone" [size]="16" />{{ t('desk.recall') }}<span class="kbd ml-1 border-white/20 bg-white/10 text-white">R</span></button>
                      <button class="btn ml-auto text-rose-300 hover:bg-rose-500/15" (click)="act(c, 'no-show')"><fc-icon name="user-x" [size]="16" />{{ t('desk.noShow') }}</button>
                    }
                    @if (c.status === 'SERVING') {
                      <button class="btn-lg btn bg-brand-500 text-white hover:bg-brand-400" (click)="act(c, 'complete')"><fc-icon name="check" [size]="18" [stroke]="2.5" />{{ t('desk.complete') }}<span class="kbd ml-1 border-white/20 bg-white/10 text-white">C</span></button>
                    }
                  </div>
                </div>
              } @else {
                <div class="flex flex-col items-center rounded-2xl border-2 border-dashed border-ink-200 px-6 py-10 text-center">
                  <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><fc-icon name="desk" [size]="22" /></span>
                  <p class="mt-3 font-semibold">{{ t('desk.none') }}</p>
                  <p class="mt-1 text-sm text-ink-500">{{ L('Bofya kitufe hapa chini kumwita anayefuata.', 'Press the button below to call the next customer.') }}</p>
                </div>
              }

              <button class="btn-primary btn-xl mt-5 w-full" [disabled]="busy() || !!(mine() && mine()!.status === 'SERVING')" (click)="callNext()">
                <fc-icon name="megaphone" [size]="22" />{{ t('desk.callNext') }}
                <span class="rounded-full bg-white/20 px-2.5 py-0.5 text-sm tabular">{{ waiting().length }}</span>
              </button>
              <p class="mt-3 hidden items-center justify-center gap-3 text-xs text-ink-500 sm:flex">
                <span><span class="kbd">N</span> {{ L('ita', 'call') }}</span><span><span class="kbd">R</span> {{ L('ita tena', 'recall') }}</span>
                <span><span class="kbd">S</span> {{ L('anza', 'start') }}</span><span><span class="kbd">C</span> {{ L('maliza', 'complete') }}</span>
              </p>
            </div>
          </section>

          <!-- Waiting list -->
          <section class="card">
            <div class="card-header">
              <h2 class="card-title">{{ t('desk.waitingList') }} <span class="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600 tabular">{{ waiting().length }}</span></h2>
              <button class="btn-ghost btn-sm" (click)="reload()"><fc-icon name="refresh" [size]="14" />{{ t('common.refresh') }}</button>
            </div>
            @if (waiting().length === 0) {
              <div class="flex flex-col items-center px-6 py-12 text-center">
                <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><fc-icon name="check-circle" [size]="22" /></span>
                <p class="mt-3 font-semibold">{{ L('Hakuna anayesubiri', 'Nobody is waiting') }}</p>
              </div>
            }
            <ul class="divide-y divide-ink-100">
              @for (tk of waiting(); track tk.id; let i = $index) {
                <li class="flex flex-wrap items-center gap-3 px-5 py-3.5 transition hover:bg-ink-50/60">
                  <span class="w-5 text-right text-xs font-medium text-ink-400 tabular">{{ i + 1 }}</span>
                  <span class="w-20 text-xl font-extrabold tracking-tight tabular">{{ tk.ticketNumber }}</span>
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium text-ink">{{ tk.customerName }}</span>
                    <span class="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">{{ tk.serviceName }} · <fc-icon name="clock" [size]="12" />{{ waitedLabel(tk) }} · <span class="uppercase">{{ tk.source }}</span></span>
                  </span>
                  @if (tk.feeAmount) { <fc-pay-badge [status]="tk.paymentStatus" /> }
                  @if (tk.feeAmount && (tk.paymentStatus === 'UNPAID' || tk.paymentStatus === 'PENDING')) {
                    <button class="btn-ghost btn-sm" (click)="override(tk, 'PAID_CASH')" [title]="t('desk.cash')"><fc-icon name="banknote" [size]="15" /></button>
                    <button class="btn-ghost btn-sm" (click)="override(tk, 'WAIVED')">{{ t('desk.waive') }}</button>
                  }
                  <button class="btn-secondary btn-sm" [disabled]="busy()" (click)="act(tk, 'call')"><fc-icon name="megaphone" [size]="14" />{{ t('desk.call') }}</button>
                </li>
              }
            </ul>
          </section>
        </div>

        <aside class="space-y-5">
          @if (appointments().length) {
            <section class="card">
              <div class="card-header"><h3 class="card-title flex items-center gap-2"><fc-icon name="calendar" [size]="16" class="text-ink-400" />{{ L('Miadi ya leo', "Today's appointments") }}</h3>
                <span class="badge-info tabular">{{ upcoming().length }}</span></div>
              <ul class="max-h-80 divide-y divide-ink-100 overflow-auto text-sm">
                @for (a of upcoming(); track a.id) {
                  <li class="flex items-center gap-3 px-5 py-3">
                    <span class="w-12 font-bold tabular">{{ fmtTime(a.startAt) }}</span>
                    <span class="min-w-0 flex-1"><span class="block truncate font-medium">{{ a.customerName }}</span>
                      <span class="text-xs text-ink-500"><span class="font-mono">{{ a.servicePrefix }}</span> · {{ t('appt.status.' + a.status) }}</span></span>
                    <button class="btn-secondary btn-sm" [disabled]="busy()" (click)="checkInAppointment(a)"><fc-icon name="check" [size]="14" />{{ L('Amefika', 'Check in') }}</button>
                  </li>
                } @empty { <li class="px-5 py-4 text-ink-500">{{ L('Wote wamefika', 'Everyone has arrived') }}</li> }
              </ul>
            </section>
          }
          <form class="card card-pad space-y-4" (ngSubmit)="walkIn()" #wf="ngForm">
            <div class="flex items-center gap-2.5"><span class="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-50 text-accent-600"><fc-icon name="zap" [size]="18" /></span>
              <h2 class="card-title">{{ t('desk.walkIn') }}</h2></div>
            <div><label class="label" for="wsvc">{{ t('admin.services') }}</label>
              <select id="wsvc" class="input" name="svc" [(ngModel)]="walkInService" required>
                @for (s of services(); track s.id) { <option [value]="s.id">{{ s.ticketPrefix }} · {{ i18n.pick(s.nameSw, s.name) }}</option> }
              </select></div>
            <div><label class="label" for="wnm">{{ t('book.name') }}</label><input id="wnm" class="input" name="nm" [(ngModel)]="walkInName" required></div>
            <div><label class="label" for="wph">{{ t('auth.phone') }} <span class="font-normal text-ink-400">({{ L('hiari', 'optional') }})</span></label>
              <input id="wph" class="input" name="ph" [(ngModel)]="walkInPhone" inputmode="tel" placeholder="0712 345 678"></div>
            <button class="btn-primary w-full" [disabled]="!wf.valid || busy()"><fc-icon name="ticket" [size]="16" />{{ L('Toa tiketi', 'Issue ticket') }}</button>
            @if (lastIssued()) {
              <div class="animate-fade-up rounded-xl bg-brand-50 p-4 text-center"><p class="text-xs font-medium text-brand-700">{{ t('desk.issued') }}</p><p class="text-3xl font-black tabular text-brand-900">{{ lastIssued() }}</p></div>
            }
          </form>

          <section class="card">
            <div class="card-header"><h3 class="card-title">{{ L('Madirisha mengine', 'Other counters') }}</h3></div>
            <ul class="divide-y divide-ink-100 text-sm">
              @for (tk of othersActive(); track tk.id) {
                <li class="flex items-center justify-between px-5 py-3"><span><b class="tabular">{{ tk.ticketNumber }}</b> <span class="text-ink-500">→ {{ tk.counterLabel }}</span></span><fc-status-badge [status]="tk.status" /></li>
              } @empty { <li class="px-5 py-4 text-ink-500">—</li> }
            </ul>
          </section>

          <section class="card">
            <div class="card-header"><h3 class="card-title">{{ t('status.NO_SHOW') }}</h3></div>
            <ul class="divide-y divide-ink-100 text-sm">
              @for (tk of queue()?.noShow ?? []; track tk.id) {
                <li class="flex items-center justify-between gap-2 px-5 py-3"><span class="min-w-0 truncate"><b class="tabular">{{ tk.ticketNumber }}</b> {{ tk.customerName }}</span>
                  <button class="btn-ghost btn-sm" (click)="act(tk, 'requeue')"><fc-icon name="undo" [size]="14" />{{ t('desk.requeue') }}</button></li>
              } @empty { <li class="px-5 py-4 text-ink-500">—</li> }
            </ul>
          </section>

          <section class="card">
            <div class="card-header"><h3 class="card-title">{{ t('desk.done') }}</h3><span class="badge-success tabular">{{ queue()?.completed?.length ?? 0 }}</span></div>
            <ul class="max-h-64 divide-y divide-ink-100 overflow-auto text-sm">
              @for (tk of queue()?.completed ?? []; track tk.id) {
                <li class="flex justify-between px-5 py-2.5 text-ink-600"><span><b class="tabular text-ink">{{ tk.ticketNumber }}</b> {{ tk.customerName }}</span><span class="tabular text-ink-400">{{ fmtTime(tk.completedAt) }}</span></li>
              }
            </ul>
          </section>
        </aside>
      </div>
    </div>
  `
})
export class StaffDeskComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly sse = inject(SseService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmtTime = time;

  protected readonly queue = signal<TodayQueue | null>(null);
  protected readonly services = signal<ServiceView[]>([]);
  protected readonly filter = signal<string[]>(this.savedFilter());
  protected readonly busy = signal(false);
  protected readonly conn = signal<ConnectionState>('connecting');
  protected readonly lastIssued = signal<string | null>(null);
  protected readonly appointments = signal<StaffAppointment[]>([]);
  /** Still expected today (booked, or marked no-show but may turn up late). */
  protected readonly upcoming = computed(() => this.appointments().filter(a => a.status === 'BOOKED' || a.status === 'NO_SHOW'));
  private readonly tick = signal(Date.now());

  protected counter = this.auth.user()?.counterLabel ?? '';
  protected walkInService = '';
  protected walkInName = '';
  protected walkInPhone = '';

  protected readonly waiting = computed(() => {
    const f = this.filter();
    return (this.queue()?.waiting ?? []).filter(tk => f.length === 0 || f.includes(tk.serviceId));
  });
  /** The ticket this agent is currently handling. */
  protected readonly mine = computed<StaffTicket | null>(() => {
    const me = this.auth.user()?.id;
    const q = this.queue();
    if (!q) return null;
    return [...q.serving, ...q.called].find(tk => tk.servedByUserId === me) ?? null;
  });
  protected readonly othersActive = computed(() => {
    const m = this.mine();
    const q = this.queue();
    return q ? [...q.called, ...q.serving].filter(tk => tk.id !== m?.id) : [];
  });

  private readonly refresh$ = new Subject<void>();

  ngOnInit(): void {
    this.http.get<ServiceView[]>(`${API}/queue/services`).subscribe(s => {
      this.services.set(s);
      this.walkInService = s[0]?.id ?? '';
    });
    this.refresh$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.reload());
    interval(30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.tick.set(Date.now()); this.reload(); });
    this.reload();

    const slug = this.auth.user()?.tenantSlug;
    const branchId = this.auth.user()?.branchId;
    if (slug) {
      this.sse.board(slug, branchId, s => this.conn.set(s))
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.refresh$.next());
    }
  }

  reload(): void {
    this.http.get<TodayQueue>(`${API}/queue/today`).subscribe({ next: q => this.queue.set(q) });
    this.http.get<StaffAppointment[]>(`${API}/queue/appointments`).subscribe({ next: l => this.appointments.set(l) });
  }

  checkInAppointment(a: StaffAppointment): void {
    this.run(this.http.patch<CheckInResult>(`${API}/queue/appointments/${a.id}/check-in`, {}),
      r => this.toast.success(`${a.customerName} → ${r.ticketNumber}`));
  }

  callNext(): void {
    this.run(this.http.post<StaffTicket>(`${API}/queue/call-next`, { serviceIds: this.filter(), counterLabel: this.counter || null }),
      tk => this.toast.success(`${this.L('Umeita', 'Called')} ${tk.ticketNumber}`));
  }

  act(tk: StaffTicket, action: 'call' | 'recall' | 'start' | 'complete' | 'no-show' | 'requeue'): void {
    const body = action === 'call' ? { counterLabel: this.counter || null } : {};
    this.run(this.http.patch<StaffTicket>(`${API}/queue/tickets/${tk.id}/${action}`, body));
  }

  override(tk: StaffTicket, action: 'PAID_CASH' | 'WAIVED'): void {
    const reason = action === 'WAIVED' ? (prompt(this.i18n.isSw() ? 'Sababu (hiari)' : 'Reason (optional)') ?? '') : '';
    this.run(this.http.patch<void>(`${API}/queue/tickets/${tk.id}/payment`, { action, reason }));
  }

  walkIn(): void {
    this.run(this.http.post<StaffTicket>(`${API}/queue/walk-in`, {
      serviceId: this.walkInService, customerName: this.walkInName, customerPhone: this.walkInPhone || null,
      language: this.i18n.lang()
    }), tk => {
      this.lastIssued.set(tk.ticketNumber);
      this.walkInName = '';
      this.walkInPhone = '';
    });
  }

  saveCounter(): void {
    if (!this.counter.trim()) return;
    this.http.patch(`${API}/queue/me/counter`, { counterLabel: this.counter.trim() }).subscribe();
  }

  toggleFilter(id: string): void {
    this.filter.update(f => f.includes(id) ? f.filter(x => x !== id) : [...f, id]);
    try { localStorage.setItem('fc.deskFilter', JSON.stringify(this.filter())); } catch { /* ignore */ }
  }

  blocked(tk: StaffTicket): boolean {
    return tk.requireUpfrontPayment && tk.paymentStatus !== 'PAID' && tk.paymentStatus !== 'WAIVED';
  }

  waitedLabel(tk: StaffTicket): string {
    this.tick();
    return `${minutesSince(tk.joinedAt)} ${this.t('common.minutes')}` + (tk.feeAmount ? ` · ${money(tk.feeAmount)}` : '');
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    const c = this.mine();
    switch (e.key.toLowerCase()) {
      case 'n': if (!c || c.status !== 'SERVING') this.callNext(); break;
      case 'r': if (c?.status === 'CALLED') this.act(c, 'recall'); break;
      case 's': if (c?.status === 'CALLED' && !this.blocked(c)) this.act(c, 'start'); break;
      case 'c': if (c?.status === 'SERVING') this.act(c, 'complete'); break;
    }
  }

  private run<T>(obs: Observable<T>, onOk?: (v: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    obs.subscribe({
      next: v => { this.busy.set(false); onOk?.(v); this.reload(); },
      error: err => {
        this.busy.set(false);
        const p = toProblem(err);
        this.toast.error(p.status === 404 && p.detail?.includes('Waiting') ? this.t('desk.empty') : this.i18n.error(p.code, p.detail));
        this.reload();
      }
    });
  }

  private savedFilter(): string[] {
    try { return JSON.parse(localStorage.getItem('fc.deskFilter') ?? '[]'); } catch { return []; }
  }
}
