import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { API, toProblem } from '../../core/api';
import { time } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { AppointmentStatus, CheckInResult, DaySlots, ServiceView, StaffAppointment } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { IconComponent } from '../../shared/icon.component';

/** Day view of bookings, plus booking on behalf of a customer (e.g. over the phone). */
@Component({
    selector: 'fc-appointments',
    imports: [FormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.appointments') }}</h1>
        <p class="page-subtitle">{{ L('Wateja waliopanga muda. Wakifika, wasajili ili wapate namba ya foleni.', 'Customers who booked a time. When they arrive, check them in to give them a queue number.') }}</p>
      </div>
      <button class="btn-primary" (click)="openForm()" [disabled]="bookable().length === 0"><fc-icon name="plus" [size]="16" [stroke]="2.25" />{{ L('Weka miadi', 'New booking') }}</button>
    </div>

    @if (bookable().length === 0 && loaded()) {
      <div class="alert-info mb-6"><fc-icon name="info" [size]="18" class="mt-px" />
        <span>{{ L('Hakuna huduma inayoruhusu miadi bado. Washa "Wateja wanaweza kuweka miadi" kwenye ukurasa wa Huduma.', 'No service takes bookings yet. Turn on "Customers can book a time in advance" on the Services page.') }}</span></div>
    }

    @if (formOpen()) {
      <form class="card mb-6 animate-fade-up" (ngSubmit)="book()" #bf="ngForm">
        <div class="card-header"><h2 class="card-title">{{ L('Miadi mpya', 'New booking') }} · {{ longDate(date()) }}</h2>
          <button type="button" class="btn-icon h-8 w-8" (click)="formOpen.set(false)" [attr.aria-label]="t('common.close')"><fc-icon name="x" [size]="16" /></button></div>
        <div class="card-pad grid gap-5 sm:grid-cols-2">
          <div><label class="label" for="asvc">{{ t('admin.services') }}</label>
            <select id="asvc" class="input" name="svc" [(ngModel)]="formService" (ngModelChange)="loadSlots()" required>
              @for (s of bookable(); track s.id) { <option [value]="s.id">{{ s.ticketPrefix }} · {{ i18n.pick(s.nameSw, s.name) }}</option> }
            </select></div>
          <div><label class="label" for="aslot">{{ L('Muda', 'Time') }}</label>
            <select id="aslot" class="input" name="slot" [(ngModel)]="formSlot" required [disabled]="freeSlots().length === 0">
              @for (sl of freeSlots(); track sl.start) { <option [value]="sl.start">{{ fmtTime(sl.start) }} – {{ fmtTime(sl.end) }} ({{ sl.remaining }} {{ L('nafasi', 'left') }})</option> }
            </select>
            @if (freeSlots().length === 0) { <p class="hint">{{ t('appt.noSlots') }}</p> }</div>
          <div><label class="label" for="anm">{{ t('book.name') }}</label><input id="anm" class="input" name="nm" [(ngModel)]="formName" required maxlength="120"></div>
          <div><label class="label" for="aph">{{ t('auth.phone') }}</label><input id="aph" class="input" name="ph" [(ngModel)]="formPhone" required inputmode="tel" placeholder="0712 345 678"></div>
          <div class="sm:col-span-2"><label class="label" for="ant">{{ L('Maelezo (hiari)', 'Notes (optional)') }}</label><input id="ant" class="input" name="nt" [(ngModel)]="formNotes" maxlength="500"></div>
        </div>
        <div class="flex justify-end gap-2 border-t border-ink-100 px-5 py-4 sm:px-6">
          <button type="button" class="btn-secondary" (click)="formOpen.set(false)">{{ t('common.cancel') }}</button>
          <button class="btn-primary" [disabled]="!bf.valid || busy()">{{ t('appt.book') }}</button>
        </div>
      </form>
    }

    <div class="card overflow-hidden">
      <div class="card-header flex-wrap gap-3">
        <div class="flex items-center gap-1.5">
          <button class="btn-icon h-9 w-9" (click)="shift(-1)" [attr.aria-label]="L('Siku iliyopita', 'Previous day')"><fc-icon name="arrow-left" [size]="16" /></button>
          <input type="date" class="input h-9 w-40 text-sm" [ngModel]="date()" (ngModelChange)="setDate($event)" [attr.aria-label]="L('Tarehe', 'Date')">
          <button class="btn-icon h-9 w-9" (click)="shift(1)" [attr.aria-label]="L('Siku ijayo', 'Next day')"><fc-icon name="arrow-right" [size]="16" /></button>
          @if (date() !== today) { <button class="btn-ghost btn-sm" (click)="setDate(today)">{{ t('appt.today') }}</button> }
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          @for (c of counts(); track c.status) { <span [class]="badge(c.status)">{{ t('appt.status.' + c.status) }} {{ c.n }}</span> }
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr><th class="table-th w-24">{{ L('Muda', 'Time') }}</th><th class="table-th">{{ L('Mteja', 'Customer') }}</th><th class="table-th">{{ t('admin.services') }}</th>
            <th class="table-th">{{ L('Hali', 'Status') }}</th><th class="table-th"></th></tr></thead>
          <tbody>
            @for (a of list(); track a.id) {
              <tr class="transition hover:bg-ink-50/50" [class.opacity-60]="a.status === 'CANCELLED'">
                <td class="table-td font-semibold tabular">{{ fmtTime(a.startAt) }}<span class="block text-xs font-normal text-ink-400">{{ fmtTime(a.endAt) }}</span></td>
                <td class="table-td"><p class="font-semibold text-ink">{{ a.customerName }}</p>
                  <p class="text-xs text-ink-500"><a class="hover:underline" [href]="'tel:+' + a.customerPhone">+{{ a.customerPhone }}</a>
                    @if (a.source === 'STAFF') { · {{ L('kwa simu', 'by staff') }} }</p>
                  @if (a.notes) { <p class="mt-0.5 text-xs text-ink-500">{{ a.notes }}</p> }</td>
                <td class="table-td"><span class="font-mono text-xs font-bold">{{ a.servicePrefix }}</span> {{ a.serviceName }}</td>
                <td class="table-td"><span [class]="badge(a.status)">{{ t('appt.status.' + a.status) }}</span>
                  @if (a.ticketNumber) { <span class="ml-2 font-bold tabular">{{ a.ticketNumber }}</span> }</td>
                <td class="table-td whitespace-nowrap text-right">
                  @if (date() === today && (a.status === 'BOOKED' || a.status === 'NO_SHOW')) {
                    <button class="btn-secondary btn-sm" [disabled]="busy()" (click)="checkIn(a)"><fc-icon name="check" [size]="14" />{{ L('Amefika', 'Check in') }}</button>
                  }
                  @if (a.status === 'BOOKED') {
                    @if (date() === today) { <button class="btn-ghost btn-sm" [disabled]="busy()" (click)="act(a, 'no-show')"><fc-icon name="user-x" [size]="14" />{{ t('desk.noShow') }}</button> }
                    <button class="btn-ghost btn-sm text-rose-600" [disabled]="busy()" (click)="act(a, 'cancel')"><fc-icon name="x" [size]="14" />{{ t('common.cancel') }}</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="table-td py-12 text-center text-ink-500">{{ L('Hakuna miadi siku hii.', 'No bookings on this day.') }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class AppointmentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmtTime = time;
  protected readonly today = localIsoDate(new Date());

  protected readonly date = signal(this.today);
  protected readonly list = signal<StaffAppointment[]>([]);
  protected readonly services = signal<ServiceView[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly slots = signal<DaySlots | null>(null);
  protected readonly bookable = computed(() => this.services().filter(s => s.active && s.allowAppointments));
  protected readonly freeSlots = computed(() => (this.slots()?.slots ?? []).filter(s => s.available));
  protected readonly counts = computed(() => {
    const by = new Map<AppointmentStatus, number>();
    for (const a of this.list()) by.set(a.status, (by.get(a.status) ?? 0) + 1);
    return [...by.entries()].map(([status, n]) => ({ status, n }));
  });

  protected formService = '';
  protected formSlot = '';
  protected formName = '';
  protected formPhone = '';
  protected formNotes = '';

  ngOnInit(): void {
    this.http.get<ServiceView[]>(`${API}/queue/services`).subscribe(s => { this.services.set(s); this.loaded.set(true); });
    this.load();
  }

  setDate(d: string): void {
    if (!d) return;
    this.date.set(d);
    this.load();
    if (this.formOpen()) this.loadSlots();
  }

  shift(days: number): void {
    const [y, m, d] = this.date().split('-').map(Number);
    this.setDate(localIsoDate(new Date(y, m - 1, d + days)));
  }

  openForm(): void {
    this.formService = this.formService || this.bookable()[0]?.id || '';
    this.formOpen.set(true);
    this.loadSlots();
  }

  loadSlots(): void {
    if (!this.formService) return;
    this.http.get<DaySlots>(`${API}/queue/appointments/slots?serviceId=${this.formService}&date=${this.date()}`).subscribe({
      next: d => { this.slots.set(d); this.formSlot = d.slots.find(s => s.available)?.start ?? ''; },
      error: err => { const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }

  book(): void {
    this.run(this.http.post<StaffAppointment>(`${API}/queue/appointments`, {
      serviceId: this.formService, startAt: this.formSlot, customerName: this.formName.trim(), customerPhone: this.formPhone.trim(),
      notes: this.formNotes.trim() || null, language: this.i18n.lang()
    }), a => {
      this.toast.success(`${this.L('Miadi imewekwa', 'Booked')}: ${a.customerName} · ${time(a.startAt)}`);
      this.formName = ''; this.formPhone = ''; this.formNotes = '';
      this.loadSlots();
    });
  }

  checkIn(a: StaffAppointment): void {
    this.run(this.http.patch<CheckInResult>(`${API}/queue/appointments/${a.id}/check-in`, {}),
      r => this.toast.success(`${a.customerName} → ${r.ticketNumber}`));
  }

  act(a: StaffAppointment, action: 'cancel' | 'no-show'): void {
    if (action === 'cancel' && !confirm(this.t('appt.cancelConfirm'))) return;
    this.run(this.http.patch<StaffAppointment>(`${API}/queue/appointments/${a.id}/${action}`, {}));
  }

  badge(status: AppointmentStatus): string {
    return { BOOKED: 'badge-info', CHECKED_IN: 'badge-success', CANCELLED: 'badge-neutral', NO_SHOW: 'badge-warning' }[status];
  }

  longDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString(this.i18n.isSw() ? 'sw-TZ' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  private load(): void {
    this.http.get<StaffAppointment[]>(`${API}/queue/appointments?date=${this.date()}`).subscribe(l => this.list.set(l));
  }

  private run<T>(obs: Observable<T>, onOk?: (v: T) => void): void {
    if (this.busy()) return;
    this.busy.set(true);
    obs.subscribe({
      next: v => { this.busy.set(false); onOk?.(v); this.load(); },
      error: err => { this.busy.set(false); const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); this.load(); if (this.formOpen()) this.loadSlots(); }
    });
  }
}

/** YYYY-MM-DD in the browser's own timezone (the business's local day). */
export function localIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
