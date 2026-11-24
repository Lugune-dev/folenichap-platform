import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { interval } from 'rxjs';
import { API, toProblem } from '../../core/api';
import { money, time } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { PublicAppointment } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { LogoComponent } from '../../shared/logo.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';

/** Customer's booking page: folenichap.co.tz/a/{token}. Check in on arrival, or cancel. */
@Component({
    selector: 'fc-appointment-page',
    imports: [RouterLink, IconComponent, LangSwitchComponent, ThemeToggleComponent, LogoComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="min-h-screen bg-ink-50">
      <div class="mx-auto max-w-md px-4 py-5 sm:py-8">
        <div class="mb-4 flex items-center justify-between">
          <fc-logo [size]="22" />
          <div class="flex items-center gap-2"><fc-theme-toggle /><fc-lang-switch /></div>
        </div>

        @if (appt(); as a) {
          <section class="card overflow-hidden">
            <div class="px-6 pb-6 pt-6 text-white" [class]="headerClass()">
              <p class="flex items-center gap-2 text-sm font-semibold text-white/85"><fc-icon [name]="statusIcon()" [size]="16" />{{ t('appt.' + a.status) }}</p>
              <p class="mt-3 text-sm text-white/80">{{ a.businessName }}</p>
              <p class="text-xl font-bold">{{ i18n.pick(a.serviceNameSw, a.serviceName) }}</p>
              <p class="mt-4 text-4xl font-black tracking-tight tabular">{{ fmtTime(a.startAt) }}</p>
              <p class="mt-1 text-base font-medium text-white/90">{{ longDate(a.startAt) }}</p>
            </div>

            <div class="card-pad space-y-5">
              <dl class="grid grid-cols-2 gap-4 text-sm">
                <div><dt class="text-ink-500">{{ L('Jina', 'Name') }}</dt><dd class="font-semibold">{{ a.customerName }}</dd></div>
                <div><dt class="text-ink-500">{{ L('Simu', 'Phone') }}</dt><dd class="font-semibold tabular">{{ a.customerPhoneMasked }}</dd></div>
                <div class="col-span-2"><dt class="text-ink-500">{{ t('book.branch') }}</dt>
                  <dd class="font-semibold">{{ a.branchName }}@if (a.branchAddress) { <span class="font-normal text-ink-500"> · {{ a.branchAddress }}</span> }</dd></div>
              </dl>

              @if (a.status === 'CHECKED_IN' && a.ticketTrackingToken) {
                <div class="rounded-2xl bg-brand-50 p-5 text-center">
                  <p class="text-sm font-medium text-brand-700">{{ t('track.yourNumber') }}</p>
                  <p class="text-5xl font-black tracking-tight tabular text-brand-900">{{ a.ticketNumber }}</p>
                  <a class="btn-primary btn-lg mt-4 w-full" [routerLink]="['/t', a.ticketTrackingToken]"><fc-icon name="ticket" [size]="18" />{{ t('appt.viewTicket') }}</a>
                </div>
              }

              @if (a.canCheckIn) {
                <button class="btn-primary btn-xl w-full" [disabled]="busy()" (click)="checkIn()">
                  @if (busy()) { <span class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
                  @else { <fc-icon name="check-circle" [size]="20" /> }
                  {{ t('appt.checkIn') }}
                </button>
                <p class="text-center text-xs text-ink-500">{{ L('Bonyeza ukiwa umefika ili upate namba yako ya foleni.', 'Tap this once you have arrived to get your queue number.') }}</p>
              } @else if (a.status === 'BOOKED' && notOpenYet()) {
                <div class="alert-info"><fc-icon name="clock" [size]="18" class="mt-px" />
                  <span>{{ L('Kujisajili kunafunguliwa ' + longDate(a.checkInOpensAt) + ' saa ' + fmtTime(a.checkInOpensAt) + '. Utapata ukumbusho kabla.',
                             'Check-in opens on ' + longDate(a.checkInOpensAt) + ' at ' + fmtTime(a.checkInOpensAt) + '. We will remind you beforehand.') }}</span></div>
              } @else if (a.status === 'BOOKED') {
                <div class="alert-warning"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ i18n.error('CHECK_IN_CLOSED') }}</span></div>
              }

              @if (a.status === 'BOOKED' && a.feeAmount > 0) {
                <p class="flex items-start gap-2 text-sm text-ink-600"><fc-icon name="banknote" [size]="16" class="mt-px" />
                  {{ L('Ada: ' + fmt(a.feeAmount, a.currency) + ', inalipwa ukijisajili.', 'Fee: ' + fmt(a.feeAmount, a.currency) + ', paid when you check in.') }}</p>
              }

              @if (error()) { <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div> }

              @if (a.status === 'BOOKED') {
                <p class="flex items-start gap-2 text-xs text-ink-500"><fc-icon name="link" [size]="14" class="mt-px" />{{ L('Hifadhi kiungo hiki. Tumekutumia pia kwa SMS/WhatsApp.', 'Keep this link. We also sent it to you by SMS/WhatsApp.') }}</p>
              }
              @if (a.canCancel) {
                <button class="btn-ghost w-full text-rose-600 hover:bg-rose-50" [disabled]="busy()" (click)="cancel()"><fc-icon name="x" [size]="16" />{{ t('appt.cancel') }}</button>
              }
              @if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') {
                <a class="btn-secondary w-full" [routerLink]="['/b', a.tenantSlug]"><fc-icon name="calendar" [size]="16" />{{ L('Weka miadi mpya', 'Book again') }}</a>
              }
            </div>
          </section>
        } @else if (notFound()) {
          <div class="card card-pad flex flex-col items-center py-16 text-center">
            <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><fc-icon name="search" [size]="26" /></span>
            <p class="mt-4 text-lg font-semibold">{{ L('Miadi haikupatikana', 'Appointment not found') }}</p>
            <p class="mt-1 text-sm text-ink-500">{{ L('Hakikisha kiungo ni sahihi.', 'Check that the link is correct.') }}</p>
          </div>
        } @else {
          <div class="skeleton h-80"></div>
        }
      </div>
    </div>
  `
})
export class AppointmentPageComponent implements OnInit {
  readonly token = input.required<string>();

  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmt = money;
  protected readonly fmtTime = time;

  protected readonly appt = signal<PublicAppointment | null>(null);
  protected readonly notFound = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly now = signal(Date.now());

  protected readonly notOpenYet = computed(() => {
    const a = this.appt();
    return !!a && this.now() < new Date(a.checkInOpensAt).getTime();
  });
  protected readonly headerClass = computed(() => {
    switch (this.appt()?.status) {
      case 'CHECKED_IN': return 'bg-gradient-to-br from-brand-600 to-brand-800';
      case 'CANCELLED': case 'NO_SHOW': return 'bg-gradient-to-br from-ink-500 to-ink-700';
      default: return 'bg-gradient-to-br from-brand-700 to-brand-900';
    }
  });
  protected readonly statusIcon = computed(() => {
    switch (this.appt()?.status) {
      case 'CHECKED_IN': return 'check-circle';
      case 'CANCELLED': case 'NO_SHOW': return 'x';
      default: return 'calendar';
    }
  });

  ngOnInit(): void {
    this.load();
    // check-in opens on its own: refresh now and then so the button appears without a reload
    interval(60_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.now.set(Date.now()); this.load(); });
  }

  longDate(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.isSw() ? 'sw-TZ' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  checkIn(): void {
    this.busy.set(true);
    this.error.set(null);
    this.http.post<PublicAppointment>(`${API}/public/appointments/${encodeURIComponent(this.token())}/check-in`, {}).subscribe({
      next: a => {
        this.appt.set(a);
        this.busy.set(false);
        if (a.ticketTrackingToken) this.router.navigate(['/t', a.ticketTrackingToken]);
      },
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); this.load(); }
    });
  }

  cancel(): void {
    if (!confirm(this.t('appt.cancelConfirm'))) return;
    this.busy.set(true);
    this.error.set(null);
    this.http.post<void>(`${API}/public/appointments/${encodeURIComponent(this.token())}/cancel`, {}).subscribe({
      next: () => { this.busy.set(false); this.load(); },
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  private load(): void {
    this.http.get<PublicAppointment>(`${API}/public/appointments/${encodeURIComponent(this.token())}`).subscribe({
      next: a => this.appt.set(a),
      error: () => { if (!this.appt()) this.notFound.set(true); }
    });
  }
}
