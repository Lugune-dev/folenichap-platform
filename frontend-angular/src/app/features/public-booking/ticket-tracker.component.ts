import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subscription, debounceTime, interval, Subject } from 'rxjs';
import { API, toProblem } from '../../core/api';
import { money, time } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { MobileProvider, TicketStatusView } from '../../core/models';
import { ConnectionState, SseService } from '../../core/sse.service';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { PayBadgeComponent } from '../../shared/badges.component';
import { LogoComponent } from '../../shared/logo.component';

/** Live ticket tracker: position, ETA, payment, "your turn" alert with vibration. */
@Component({
    selector: 'fc-ticket-tracker',
    imports: [LangSwitchComponent, ThemeToggleComponent, PayBadgeComponent, IconComponent, LogoComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen bg-ink-50">
      <div class="mx-auto max-w-md px-4 py-5 sm:py-8">
        <div class="mb-4 flex items-center justify-between">
          <span class="inline-flex items-center gap-2 rounded-full bg-surface px-3 py-1 text-xs font-semibold shadow-sm ring-1 ring-ink-200"
            [class.text-brand-700]="conn() === 'live'" [class.text-accent-600]="conn() !== 'live'">
            <span class="h-2 w-2 rounded-full" [class]="conn() === 'live' ? 'bg-brand-500 animate-pulse' : 'bg-accent-400'"></span>
            {{ conn() === 'live' ? t('track.live') : L('Inaunganisha…', 'Connecting…') }}
          </span>
          <div class="flex items-center gap-2"><fc-theme-toggle /><fc-lang-switch /></div>
        </div>

        @if (ticket(); as tk) {
          <article class="card overflow-hidden">
            <!-- Number + status -->
            <div class="relative px-6 pb-7 pt-6 text-center" [class]="headerCls()">
              <p class="text-xs font-semibold uppercase tracking-[0.14em] opacity-80">{{ tk.businessName }}</p>
              <p class="mt-1 text-sm opacity-80">{{ tk.branchName }} · {{ i18n.pick(tk.serviceNameSw, tk.serviceName) }}</p>
              <p class="mt-6 text-2xs font-semibold uppercase tracking-[0.18em] opacity-75">{{ t('track.yourNumber') }}</p>
              <p class="mt-1 text-[5.5rem] font-black leading-none tracking-tight tabular" [class.animate-pulse]="tk.status === 'CALLED'">{{ tk.ticketNumber }}</p>
              <p class="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-base font-bold" [class]="pillCls()">
                <fc-icon [name]="statusIcon()" [size]="18" />{{ t('track.' + tk.status) }}
                @if (tk.status === 'CALLED' && tk.counterLabel) { <span class="underline decoration-2 underline-offset-4">{{ tk.counterLabel }}</span> }
              </p>
            </div>

            @if (tk.status === 'WAITING') {
              <div class="grid grid-cols-2 divide-x divide-ink-100 border-b border-ink-100">
                <div class="p-5 text-center"><p class="text-4xl font-extrabold tabular">{{ tk.peopleAhead }}</p><p class="mt-1 text-sm text-ink-500">{{ t('track.ahead') }}</p></div>
                <div class="p-5 text-center"><p class="text-4xl font-extrabold tabular">~{{ tk.estimatedWaitMinutes }}</p><p class="mt-1 text-sm text-ink-500">{{ t('track.eta') }} ({{ t('common.minutes') }})</p></div>
              </div>
              <div class="px-6 pt-4">
                <div class="h-2 overflow-hidden rounded-full bg-ink-100" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100">
                  <div class="h-full rounded-full bg-brand-500 transition-all duration-700" [style.width.%]="progress()"></div>
                </div>
              </div>
            }

            @if (tk.feeAmount > 0) {
              <div class="border-b border-ink-100 p-5">
                <div class="flex items-center justify-between">
                  <div><p class="text-xs font-medium text-ink-500">{{ t('book.fee') }}</p><p class="text-lg font-bold tabular">{{ fmt(tk.feeAmount, tk.currency) }}</p></div>
                  <fc-pay-badge [status]="tk.paymentStatus" />
                </div>
                @if (payMsg()) {
                  <div class="mt-3" [class]="tk.paymentStatus === 'PENDING' ? 'alert-info' : 'alert-warning'">
                    <fc-icon [name]="tk.paymentStatus === 'PENDING' ? 'phone' : 'info'" [size]="18" class="mt-px" /><span>{{ payMsg() }}</span>
                  </div>
                }
                @if (tk.paymentStatus === 'UNPAID' && active()) {
                  <p class="label mt-4">{{ L('Lipa sasa kwa', 'Pay now with') }}</p>
                  <div class="grid grid-cols-2 gap-2">
                    @for (p of providers; track p.id) {
                      <button type="button" class="btn-secondary h-11" [disabled]="paying()" (click)="pay(p.id)">{{ p.label }}</button>
                    }
                  </div>
                }
                @if (tk.paymentStatus === 'PAID') {
                  <p class="mt-3 flex items-center gap-2 text-sm font-medium text-brand-700"><fc-icon name="shield" [size]="16" />{{ L('Malipo yamethibitishwa', 'Payment verified') }}</p>
                }
              </div>
            }

            <dl class="grid grid-cols-2 gap-4 p-5 text-sm">
              <div><dt class="flex items-center gap-1.5 text-ink-500"><fc-icon name="ticket" [size]="14" />{{ L('Umejiunga', 'Joined') }}</dt><dd class="mt-0.5 font-semibold tabular">{{ fmtTime(tk.joinedAt) }}</dd></div>
              @if (tk.calledAt) { <div><dt class="flex items-center gap-1.5 text-ink-500"><fc-icon name="megaphone" [size]="14" />{{ L('Umeitwa', 'Called') }}</dt><dd class="mt-0.5 font-semibold tabular">{{ fmtTime(tk.calledAt) }}</dd></div> }
            </dl>
            @if (active()) {
              <div class="mx-5 mb-5 flex items-start gap-2.5 rounded-xl bg-ink-50 p-3 text-sm text-ink-600"><fc-icon name="bell" [size]="16" class="mt-0.5 text-brand-700" />{{ t('track.keepOpen') }}</div>
            }
          </article>

          @if (tk.status === 'WAITING') {
            <button class="btn-danger-ghost mt-4 w-full" (click)="cancel()"><fc-icon name="x" [size]="16" />{{ t('track.cancel') }}</button>
          }
        } @else if (error()) {
          <div class="alert-danger"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div>
        } @else {
          <div class="skeleton h-80"></div>
        }

        <p class="mt-8 flex items-center justify-center gap-2 text-xs text-ink-400">{{ L('Inaendeshwa na', 'Powered by') }} <fc-logo [size]="18" /></p>
      </div>
    </div>
  `
})
export class TicketTrackerComponent implements OnInit {
  readonly token = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly sse = inject(SseService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmt = money;
  protected readonly fmtTime = time;
  protected readonly providers: { id: MobileProvider; label: string }[] = [
    { id: 'MPESA', label: 'M-Pesa' }, { id: 'TIGOPESA', label: 'Mixx by Yas' }, { id: 'AIRTEL', label: 'Airtel' }, { id: 'HALOPESA', label: 'HaloPesa' }
  ];

  protected readonly ticket = signal<TicketStatusView | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly conn = signal<ConnectionState>('connecting');
  protected readonly paying = signal(false);
  protected readonly payMsg = signal<string | null>(null);
  private readonly startAhead = signal<number | null>(null);
  protected readonly active = computed(() => ['WAITING', 'CALLED', 'SERVING'].includes(this.ticket()?.status ?? ''));
  protected readonly progress = computed(() => {
    const now = this.ticket()?.peopleAhead ?? 0;
    const start = Math.max(this.startAhead() ?? now, 1);
    return Math.round(Math.max(8, Math.min(100, ((start - now) / start) * 100 + 8)));
  });
  protected readonly headerCls = computed(() => {
    switch (this.ticket()?.status) {
      case 'CALLED': return 'bg-gradient-to-br from-brand-600 to-brand-800 text-white';
      case 'SERVING': return 'bg-gradient-to-br from-brand-800 to-brand-950 text-white';
      case 'COMPLETED': return 'bg-brand-50 text-brand-900';
      case 'NO_SHOW': case 'CANCELLED': return 'bg-ink-100 text-ink';
      default: return 'bg-night-950 text-white';
    }
  });
  protected readonly pillCls = computed(() => {
    switch (this.ticket()?.status) {
      case 'CALLED': return 'bg-surface text-brand-800 shadow-lift';
      case 'SERVING': return 'bg-white/15 text-white';
      case 'COMPLETED': return 'bg-brand-100 text-brand-800';
      case 'NO_SHOW': case 'CANCELLED': return 'bg-surface text-ink-600';
      default: return 'bg-white/10 text-white';
    }
  });
  protected readonly statusIcon = computed(() => {
    switch (this.ticket()?.status) {
      case 'CALLED': return 'megaphone';
      case 'SERVING': return 'desk';
      case 'COMPLETED': return 'check-circle';
      case 'NO_SHOW': case 'CANCELLED': return 'x';
      default: return 'clock';
    }
  });

  private readonly refresh$ = new Subject<void>();
  private streamSub?: Subscription;

  ngOnInit(): void {
    const pay = this.route.snapshot.queryParamMap.get('pay');
    if (pay) this.payMsg.set(this.t(pay === 'PUSH_SENT' ? 'track.pushSent' : 'track.pushFailed'));

    this.refresh$.pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.fetch());
    // polling fallback (cheap) in case SSE is blocked by a proxy
    interval(30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.fetch());
    this.fetch(true);
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => void 0);
    }
  }

  private fetch(first = false): void {
    this.http.get<TicketStatusView>(`${API}/public/tickets/${encodeURIComponent(this.token())}`).subscribe({
      next: tk => {
        const prev = this.ticket();
        this.ticket.set(tk);
        if (this.startAhead() === null && tk.status === 'WAITING') this.startAhead.set(tk.peopleAhead);
        if (first) this.connect(tk);
        if (prev && prev.status !== 'CALLED' && tk.status === 'CALLED') this.alertTurn(tk);
        if (prev?.paymentStatus !== 'PAID' && tk.paymentStatus === 'PAID') this.payMsg.set(null);
        if (!this.active()) this.streamSub?.unsubscribe();
      },
      error: err => { const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  private connect(tk: TicketStatusView): void {
    if (!['WAITING', 'CALLED', 'SERVING'].includes(tk.status)) return;
    this.streamSub = this.sse.board(tk.tenantSlug, tk.branchId, s => this.conn.set(s))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh$.next());
  }

  private alertTurn(tk: TicketStatusView): void {
    navigator.vibrate?.([400, 200, 400, 200, 600]);
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`${tk.ticketNumber} — ${tk.businessName}`, { body: `${this.t('track.CALLED')} ${tk.counterLabel ?? ''}` });
      }
    } catch { /* some mobile browsers only allow SW notifications */ }
  }

  pay(provider: MobileProvider): void {
    this.paying.set(true);
    this.http.post<TicketStatusView>(`${API}/public/tickets/${encodeURIComponent(this.token())}/pay`, { paymentProvider: provider }).subscribe({
      next: tk => {
        this.paying.set(false);
        this.ticket.set(tk);
        this.payMsg.set(this.t(tk.paymentMessage === 'PUSH_SENT' ? 'track.pushSent' : 'track.pushFailed'));
      },
      error: err => { this.paying.set(false); const p = toProblem(err); this.payMsg.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  cancel(): void {
    if (!confirm(this.t('track.cancelConfirm'))) return;
    this.http.post(`${API}/public/tickets/${encodeURIComponent(this.token())}/cancel`, {}).subscribe({ next: () => this.fetch() });
  }
}
