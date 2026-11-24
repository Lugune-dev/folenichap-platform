import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { API, toProblem } from '../../core/api';
import { money, time } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { DaySlots, MobileProvider, PublicAppointment, PublicService, PublicTenant, TicketStatusView } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';

const PROVIDERS: { id: MobileProvider; label: string }[] = [
  { id: 'MPESA', label: 'M-Pesa' }, { id: 'TIGOPESA', label: 'Mixx by Yas' }, { id: 'AIRTEL', label: 'Airtel Money' },
  { id: 'HALOPESA', label: 'HaloPesa' }, { id: 'AZAMPESA', label: 'AzamPesa' }
];

/** Mobile-first QR booking page: folenichap.co.tz/b/{slug} */
@Component({
    selector: 'fc-booking-page',
    imports: [FormsModule, LangSwitchComponent, ThemeToggleComponent, IconComponent, LogoComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen bg-ink-50 sm:py-8">
      <div class="mx-auto min-h-screen max-w-md bg-surface sm:min-h-0 sm:overflow-hidden sm:rounded-3xl sm:border sm:border-ink-200 sm:shadow-lift">
        @if (tenant(); as tn) {
          <header class="relative overflow-hidden bg-gradient-to-br from-brand-700 to-brand-900 px-5 pb-7 pt-5 text-white">
            <div class="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-2xl"></div>
            <div class="relative flex items-center justify-between">
              @if (tn.logoUrl) { <img [src]="tn.logoUrl" alt="" class="h-11 w-11 rounded-xl bg-white object-contain p-1"> }
              @else { <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-lg font-bold ring-1 ring-inset ring-white/20">{{ tn.businessName.charAt(0) }}</span> }
              <div class="flex items-center gap-2"><fc-theme-toggle [onDark]="true" /><fc-lang-switch [onDark]="true" /></div>
            </div>
            <h1 class="relative mt-5 text-2xl font-bold tracking-tight text-white">{{ tn.businessName }}</h1>
            <p class="relative mt-1.5 text-[15px] leading-relaxed text-brand-50/90">{{ i18n.pick(tn.greetingSw, tn.greetingEn) }}</p>
            <div class="relative mt-4 flex flex-wrap gap-2">
              <span class="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-sm font-medium ring-1 ring-inset ring-white/15">
                <span class="h-2 w-2 animate-pulse rounded-full bg-brand-300"></span>{{ tn.waitingCount }} {{ t('book.waiting') }}
              </span>
              @if (tn.acceptingTickets) {
                <span class="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium ring-1 ring-inset ring-white/15"><fc-icon name="check" [size]="14" [stroke]="2.5" />{{ L('Tuko wazi', 'Open now') }}</span>
              }
            </div>
          </header>

          <main class="space-y-6 px-5 py-6">
            @if (!tn.acceptingTickets && !tn.acceptingAppointments) {
              <div class="alert-warning"><fc-icon name="clock" [size]="18" class="mt-px" /><span>{{ t('book.closed') }}</span></div>
            } @else {
              @if (!tn.acceptingTickets) {
                <div class="alert-warning"><fc-icon name="calendar" [size]="18" class="mt-px" /><span>{{ t('appt.closedNow') }}</span></div>
              } @else if (tn.acceptingAppointments) {
                <div class="grid grid-cols-2 gap-1 rounded-2xl bg-ink-100 p-1" role="tablist">
                  @for (m of modes; track m.id) {
                    <button type="button" role="tab" [attr.aria-selected]="mode() === m.id" (click)="setMode(m.id)"
                      class="flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition"
                      [class]="mode() === m.id ? 'bg-surface text-brand-800 shadow-sm' : 'text-ink-600 hover:text-ink'">
                      <fc-icon [name]="m.icon" [size]="16" />{{ t(m.label) }}</button>
                  }
                </div>
              }
              @if (tn.branches.length > 1) {
                <div><label class="label" for="br">{{ t('book.branch') }}</label>
                  <select id="br" class="input" [ngModel]="tn.branchId" (ngModelChange)="changeBranch($event)">
                    @for (b of tn.branches; track b.id) { <option [value]="b.id">{{ b.name }}</option> }
                  </select></div>
              }

              <!-- Step 1: service -->
              <section aria-labelledby="svc-h">
                <h2 id="svc-h" class="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">1</span>{{ t('book.choose') }}
                </h2>
                <div class="space-y-2.5" role="radiogroup">
                  @for (s of visibleServices(); track s.id) {
                    <button type="button" role="radio" [attr.aria-checked]="selected()?.id === s.id" (click)="choose(s)" class="option" [class.selected]="selected()?.id === s.id">
                      <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                        [class]="selected()?.id === s.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-ink-300'">
                        @if (selected()?.id === s.id) { <fc-icon name="check" [size]="12" [stroke]="3" /> }
                      </span>
                      <span class="min-w-0 flex-1">
                        <span class="block font-semibold text-ink">{{ i18n.pick(s.nameSw, s.name) }}</span>
                        <span class="mt-0.5 flex items-center gap-1.5 text-sm text-ink-500">
                          @if (mode() === 'later') { <fc-icon name="clock" [size]="14" />{{ s.avgDurationMinutes }} {{ t('common.minutes') }} }
                          @else { <fc-icon name="users" [size]="14" />{{ s.waitingCount }} · <fc-icon name="clock" [size]="14" />~{{ s.estimatedWaitMinutes }} {{ t('common.minutes') }} }
                        </span>
                      </span>
                      <span class="shrink-0 text-right text-sm font-bold tabular" [class.text-brand-700]="s.feeAmount > 0" [class.text-ink-500]="s.feeAmount <= 0">
                        {{ s.feeAmount > 0 ? fmt(s.feeAmount, s.currency) : t('book.free') }}
                      </span>
                    </button>
                  }
                </div>
              </section>

              <!-- Step 2 (book a time): day + slot -->
              @if (mode() === 'later' && selected()) {
                <section class="animate-fade-up space-y-4" aria-labelledby="day-h">
                  <h2 id="day-h" class="flex items-center gap-2 text-sm font-semibold text-ink-700">
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">2</span>{{ t('appt.pickDay') }}
                  </h2>
                  <div class="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" role="radiogroup">
                    @for (d of days(); track d.iso) {
                      <button type="button" role="radio" [attr.aria-checked]="day() === d.iso" (click)="pickDay(d.iso)"
                        class="flex w-16 shrink-0 flex-col items-center rounded-2xl border-2 py-2 transition"
                        [class]="day() === d.iso ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-ink-200 bg-surface text-ink-700 hover:border-ink-300'">
                        <span class="text-2xs font-semibold uppercase">{{ d.dow }}</span>
                        <span class="text-lg font-bold tabular">{{ d.dom }}</span>
                        <span class="text-2xs text-ink-500">{{ d.mon }}</span>
                      </button>
                    }
                  </div>
                  <h3 class="text-sm font-semibold text-ink-700">{{ t('appt.pickTime') }}</h3>
                  @if (slotsLoading()) {
                    <div class="grid grid-cols-3 gap-2">@for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton h-11"></div> }</div>
                  } @else if (freeSlots().length === 0) {
                    <p class="rounded-xl bg-ink-50 p-4 text-center text-sm text-ink-500">{{ t('appt.noSlots') }}</p>
                  } @else {
                    <div class="grid grid-cols-3 gap-2" role="radiogroup">
                      @for (sl of freeSlots(); track sl.start) {
                        <button type="button" role="radio" [attr.aria-checked]="slot() === sl.start" (click)="slot.set(sl.start)"
                          class="h-11 rounded-xl border-2 text-sm font-semibold tabular transition"
                          [class]="slot() === sl.start ? 'border-brand-600 bg-brand-700 text-white' : 'border-ink-200 bg-surface text-ink-700 hover:border-brand-300'">
                          {{ fmtTime(sl.start) }}</button>
                      }
                    </div>
                  }
                </section>
              }

              <!-- Details (+ payment) -->
              @if (selected(); as s) { @if (mode() === 'now' || slot()) {
                <form class="animate-fade-up space-y-5" (ngSubmit)="submit()" #f="ngForm" aria-labelledby="det-h">
                  <h2 id="det-h" class="flex items-center gap-2 text-sm font-semibold text-ink-700">
                    <span class="flex h-6 w-6 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{{ mode() === 'later' ? 3 : 2 }}</span>{{ L('Taarifa zako', 'Your details') }}
                  </h2>
                  <div><label class="label" for="nm">{{ t('book.name') }}</label>
                    <input id="nm" name="name" class="input h-12" required maxlength="120" [(ngModel)]="name" autocomplete="name"></div>
                  <div><label class="label" for="ph">{{ t('book.phone') }}</label>
                    <div class="relative"><span class="pointer-events-none absolute inset-y-0 left-0 flex w-11 items-center justify-center text-ink-400"><fc-icon name="phone" [size]="18" /></span>
                      <input id="ph" name="phone" class="input h-12 pl-11" required inputmode="tel" [(ngModel)]="phone" placeholder="0712 345 678" autocomplete="tel"></div>
                    <p class="hint">{{ t('book.privacy') }}</p></div>

                  @if (mode() === 'later' && s.feeAmount > 0) {
                    <p class="flex items-start gap-2 rounded-xl bg-ink-50 p-3 text-sm text-ink-600"><fc-icon name="banknote" [size]="16" class="mt-px" />
                      {{ L('Ada ya ' + fmt(s.feeAmount, s.currency) + ' inalipwa ukifika na kujisajili.', 'The ' + fmt(s.feeAmount, s.currency) + ' fee is paid when you arrive and check in.') }}</p>
                  }
                  @if (mode() === 'now' && s.feeAmount > 0 && tn.paymentsEnabled) {
                    <div class="rounded-2xl border border-ink-200 bg-ink-50/60 p-4">
                      <div class="flex items-center justify-between">
                        <p class="text-sm font-medium text-ink-600">{{ t('book.fee') }}</p>
                        <p class="text-lg font-bold tabular">{{ fmt(s.feeAmount, s.currency) }}</p>
                      </div>
                      @if (s.requireUpfrontPayment) {
                        <p class="mt-1 text-sm text-ink-600">{{ t('book.payRequired') }}</p>
                      } @else {
                        <label class="mt-3 flex items-center gap-2.5 text-sm font-medium"><input type="checkbox" name="payNow" [(ngModel)]="payNow"> {{ t('book.payNow') }}</label>
                      }
                      @if (s.requireUpfrontPayment || payNow) {
                        <p class="label mt-4">{{ t('book.network') }}</p>
                        <div class="grid grid-cols-2 gap-2" role="radiogroup">
                          @for (p of providers; track p.id) {
                            <button type="button" role="radio" [attr.aria-checked]="provider() === p.id" (click)="provider.set(p.id)"
                              class="flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 bg-surface text-sm font-semibold transition"
                              [class]="provider() === p.id ? 'border-brand-600 text-brand-800' : 'border-ink-200 text-ink-700 hover:border-ink-300'">
                              @if (provider() === p.id) { <fc-icon name="check" [size]="14" [stroke]="2.5" /> }{{ p.label }}
                            </button>
                          }
                        </div>
                        <p class="mt-3 flex items-start gap-2 text-xs text-ink-500"><fc-icon name="lock" [size]="14" class="mt-px" />
                          {{ L('Utapokea ujumbe wa USSD kwenye simu yako. Weka PIN yako hapo tu, kamwe usiitoe kwa mtu.', 'You will get a USSD prompt on your phone. Enter your PIN only there and never share it.') }}</p>
                      }
                    </div>
                  }

                  @if (error()) { <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div> }

                  <div class="sticky bottom-0 -mx-5 border-t border-ink-100 bg-surface/95 px-5 pt-3 backdrop-blur safe-bottom sm:static sm:mx-0 sm:border-0 sm:p-0">
                    <button class="btn-primary btn-xl w-full" [disabled]="busy() || !f.valid">
                      @if (busy()) { <span class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
                      {{ busy() ? t('common.loading') : ctaLabel() }}
                    </button>
                  </div>
                </form>
              } }
            }
          </main>
          <footer class="flex items-center justify-center gap-2 border-t border-ink-100 py-5 text-xs text-ink-400">
            {{ L('Inaendeshwa na', 'Powered by') }} <fc-logo [size]="18" />
          </footer>
        } @else if (notFound()) {
          <div class="flex flex-col items-center px-6 py-20 text-center">
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><fc-icon name="search" [size]="26" /></span>
            <p class="mt-4 text-lg font-semibold">{{ L('Biashara haikupatikana', 'Business not found') }}</p>
            <p class="mt-1 text-sm text-ink-500">{{ L('Hakikisha umescan QR sahihi au kiungo ni sahihi.', 'Check that you scanned the right QR code or link.') }}</p>
          </div>
        } @else {
          <div class="skeleton h-48 rounded-none"></div>
          <div class="space-y-3 p-5">@for (i of [1,2,3]; track i) { <div class="skeleton h-20"></div> }</div>
        }
      </div>
    </div>
  `
})
export class BookingPageComponent implements OnInit {
  readonly slug = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly providers = PROVIDERS;
  protected readonly fmt = money;

  protected readonly tenant = signal<PublicTenant | null>(null);
  protected readonly notFound = signal(false);
  protected readonly selected = signal<PublicService | null>(null);
  protected readonly provider = signal<MobileProvider>('MPESA');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly branchId = computed(() => this.tenant()?.branchId);
  protected readonly fmtTime = time;
  protected readonly modes = [
    { id: 'now' as const, label: 'appt.now', icon: 'users' }, { id: 'later' as const, label: 'appt.later', icon: 'calendar' }
  ];
  private readonly chosenMode = signal<'now' | 'later'>('now');
  /** Closed right now but taking bookings: only "book a time" makes sense. */
  protected readonly mode = computed<'now' | 'later'>(() => {
    const tn = this.tenant();
    if (tn && !tn.acceptingTickets && tn.acceptingAppointments) return 'later';
    return tn?.acceptingAppointments ? this.chosenMode() : 'now';
  });
  protected readonly visibleServices = computed(() => {
    const all = this.tenant()?.services ?? [];
    return this.mode() === 'later' ? all.filter(s => s.allowAppointments) : all;
  });
  protected readonly slots = signal<DaySlots | null>(null);
  protected readonly slotsLoading = signal(false);
  protected readonly day = signal<string | null>(null);
  protected readonly slot = signal<string | null>(null);
  protected readonly freeSlots = computed(() => (this.slots()?.slots ?? []).filter(s => s.available));
  /** Next 14 bookable days, starting from the business's "today". */
  protected readonly days = computed(() => {
    const first = this.slots()?.firstBookableDate;
    if (!first) return [];
    const locale = this.i18n.isSw() ? 'sw-TZ' : 'en-GB';
    return Array.from({ length: 14 }, (_, i) => {
      const iso = addDays(first, i);
      const d = new Date(iso + 'T12:00:00Z');
      const dow = i === 0 ? this.t('appt.today') : i === 1 ? this.t('appt.tomorrow') : d.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' });
      return { iso, dow, dom: d.getUTCDate(), mon: d.toLocaleDateString(locale, { month: 'short', timeZone: 'UTC' }) };
    });
  });
  /** Plain method (not computed): payNow is a template-bound field, re-read on every change detection. */
  protected ctaLabel(): string {
    const s = this.selected();
    const pays = !!s && s.feeAmount > 0 && !!this.tenant()?.paymentsEnabled && (s.requireUpfrontPayment || this.payNow);
    if (this.mode() === 'later') return `${this.t('appt.book')} · ${time(this.slot())}`;
    return pays ? `${this.L('Lipa', 'Pay')} ${money(s!.feeAmount, s!.currency)} · ${this.L('Pata namba', 'Get number')}` : this.t('book.join');
  }

  protected name = '';
  protected phone = '';
  protected payNow = false;

  ngOnInit(): void {
    try {
      const saved = JSON.parse(localStorage.getItem('fc.customer') ?? '{}');
      this.name = saved.name ?? '';
      this.phone = saved.phone ?? '';
    } catch { /* ignore */ }
    this.load();
  }

  changeBranch(id: string): void { this.load(id); }

  setMode(m: 'now' | 'later'): void {
    this.chosenMode.set(m);
    this.error.set(null);
    const s = this.selected();
    if (m === 'later' && s && !s.allowAppointments) this.selected.set(null);
    if (m === 'later' && this.selected()) this.loadSlots(this.day() ?? undefined);
  }

  choose(s: PublicService): void {
    this.selected.set(s);
    this.error.set(null);
    if (this.mode() === 'later') this.loadSlots(this.day() ?? undefined);
  }

  pickDay(iso: string): void { this.loadSlots(iso); }

  private loadSlots(date?: string): void {
    const s = this.selected();
    if (!s) return;
    this.slot.set(null);
    this.slotsLoading.set(true);
    const q = new URLSearchParams({ serviceId: s.id });
    if (this.branchId()) q.set('branchId', this.branchId()!);
    if (date) q.set('date', date);
    this.http.get<DaySlots>(`${API}/public/tenants/${encodeURIComponent(this.slug())}/slots?${q}`).subscribe({
      next: d => { this.slots.set(d); this.day.set(d.date); this.slotsLoading.set(false); },
      error: err => { this.slotsLoading.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  private load(branchId?: string): void {
    const q = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    this.http.get<PublicTenant>(`${API}/public/tenants/${encodeURIComponent(this.slug())}${q}`).subscribe({
      next: tn => {
        this.tenant.set(tn);
        try { if (!localStorage.getItem('fc.lang')) this.i18n.set(tn.defaultLanguage); } catch { /* ignore */ }
        this.selected.set(null);
        this.slots.set(null);
        this.slot.set(null);
        const list = this.visibleServices();
        if (list.length === 1) this.choose(list[0]);
      },
      error: () => this.notFound.set(true)
    });
  }

  submit(): void {
    const s = this.selected();
    if (!s) return;
    this.busy.set(true);
    this.error.set(null);
    if (this.mode() === 'later') { this.bookAppointment(s); return; }
    const body = {
      serviceId: s.id, branchId: this.branchId(), customerName: this.name.trim(), customerPhone: this.phone.trim(),
      language: this.i18n.lang(), payNow: this.payNow, paymentProvider: this.provider()
    };
    this.http.post<TicketStatusView>(`${API}/public/tenants/${encodeURIComponent(this.slug())}/tickets`, body).subscribe({
      next: ticket => {
        try { localStorage.setItem('fc.customer', JSON.stringify({ name: this.name, phone: this.phone })); } catch { /* ignore */ }
        this.router.navigate(['/t', ticket.trackingToken], { queryParams: ticket.paymentMessage ? { pay: ticket.paymentMessage } : {} });
      },
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  private bookAppointment(s: PublicService): void {
    const body = {
      serviceId: s.id, branchId: this.branchId(), startAt: this.slot(), customerName: this.name.trim(),
      customerPhone: this.phone.trim(), language: this.i18n.lang()
    };
    this.http.post<PublicAppointment>(`${API}/public/tenants/${encodeURIComponent(this.slug())}/appointments`, body).subscribe({
      next: a => {
        try { localStorage.setItem('fc.customer', JSON.stringify({ name: this.name, phone: this.phone })); } catch { /* ignore */ }
        this.router.navigate(['/a', a.manageToken]);
      },
      error: err => {
        this.busy.set(false);
        const p = toProblem(err);
        this.error.set(this.i18n.error(p.code, p.detail));
        if (p.code === 'SLOT_FULL' || p.code === 'SLOT_UNAVAILABLE') this.loadSlots(this.day() ?? undefined);
      }
    });
  }
}

/** Adds days to a YYYY-MM-DD date without timezone surprises. */
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
