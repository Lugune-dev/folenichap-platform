import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API } from '../../core/api';
import { money } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { Dashboard } from '../../core/models';
import { IconComponent } from '../../shared/icon.component';

@Component({
    selector: 'fc-dashboard',
    imports: [FormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <p class="eyebrow">{{ L('Muhtasari', 'Overview') }}</p>
        <h1 class="page-title">{{ t('admin.dashboard') }}</h1>
        <p class="page-subtitle">{{ L('Utendaji wa foleni yako kwa kipindi ulichochagua.', 'How your queue performed over the selected period.') }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="inline-flex rounded-xl bg-ink-100 p-1 text-xs font-semibold">
          @for (r of ranges; track r.days) {
            <button type="button" class="rounded-lg px-3 py-1.5 transition" [class]="range() === r.days ? 'bg-surface text-ink shadow-sm' : 'text-ink-500 hover:text-ink'"
              (click)="setRange(r.days)">{{ L(r.sw, r.en) }}</button>
          }
        </div>
        <div class="flex items-center gap-1.5">
          <input type="date" class="input h-9 w-auto text-sm" [(ngModel)]="from" (change)="range.set(0)" [attr.aria-label]="L('Kuanzia', 'From')">
          <fc-icon name="arrow-right" [size]="14" class="text-ink-400" />
          <input type="date" class="input h-9 w-auto text-sm" [(ngModel)]="to" (change)="range.set(0)" [attr.aria-label]="L('Hadi', 'To')">
          <button class="btn-secondary h-9" (click)="load()" [attr.aria-label]="t('common.refresh')"><fc-icon name="refresh" [size]="16" /></button>
        </div>
      </div>
    </div>

    @if (data(); as d) {
      <!-- Live strip -->
      <div class="mb-4 flex flex-wrap gap-3">
        <span class="badge-warning py-1"><span class="dot animate-pulse"></span>{{ d.summary.waitingNow }} {{ L('wanasubiri sasa', 'waiting now') }}</span>
        <span class="badge-success py-1"><span class="dot"></span>{{ d.summary.inServiceNow }} {{ L('wanahudumiwa', 'being served') }}</span>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        @for (k of kpis(); track k.label) {
          <div class="stat">
            <div class="flex items-center justify-between">
              <p class="stat-label">{{ k.label }}</p>
              <span class="flex h-8 w-8 items-center justify-center rounded-lg" [class]="k.tone"><fc-icon [name]="k.icon" [size]="16" /></span>
            </div>
            <p class="stat-value">{{ k.value }}</p>
          </div>
        }
      </div>

      <!-- Daily chart -->
      <section class="card mt-6">
        <div class="card-header">
          <h2 class="card-title">{{ t('kpi.daily') }}</h2>
          <div class="flex items-center gap-4 text-xs text-ink-500">
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-brand-500"></span>{{ t('kpi.tickets') }}</span>
            <span class="flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-rose-400"></span>{{ t('kpi.noShow') }}</span>
          </div>
        </div>
        <div class="card-pad">
          @if (d.summary.totalTickets === 0) {
            <div class="flex flex-col items-center py-10 text-center">
              <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><fc-icon name="chart" [size]="22" /></span>
              <p class="mt-3 font-semibold">{{ L('Bado hakuna tiketi kwenye kipindi hiki', 'No tickets in this period yet') }}</p>
              <p class="mt-1 text-sm text-ink-500">{{ L('Shiriki QR yako ili wateja waanze kujiunga.', 'Share your QR code so customers can start joining.') }}</p>
            </div>
          } @else {
            <svg [attr.viewBox]="'0 0 ' + chartW + ' 190'" class="h-52 w-full" role="img" [attr.aria-label]="t('kpi.daily')">
              @for (g of grid; track g) {
                <line x1="0" [attr.x2]="chartW" [attr.y1]="160 - g * 150" [attr.y2]="160 - g * 150" class="stroke-ink-100" stroke-width="1" />
              }
              @for (p of d.daily; track p.date; let i = $index) {
                <rect [attr.x]="i * barStep() + barStep() * 0.18" [attr.width]="barStep() * 0.64" [attr.y]="160 - barH(p.tickets)" [attr.height]="barH(p.tickets)" rx="3" class="fill-brand-500 transition hover:fill-brand-600">
                  <title>{{ p.date }}: {{ p.tickets }} · {{ fmtMoney(p.revenue) }}</title>
                </rect>
                <rect [attr.x]="i * barStep() + barStep() * 0.18" [attr.width]="barStep() * 0.64" [attr.y]="160 - barH(p.noShows)" [attr.height]="barH(p.noShows)" rx="3" class="fill-rose-400" />
                @if (i % labelEvery() === 0) {
                  <text [attr.x]="i * barStep() + barStep() / 2" y="180" text-anchor="middle" class="fill-ink-400" style="font-size:10px">{{ p.date.slice(5) }}</text>
                }
              }
            </svg>
          }
        </div>
      </section>

      <div class="mt-6 grid gap-6 lg:grid-cols-2">
        <section class="card">
          <div class="card-header"><h2 class="card-title">{{ t('kpi.peak') }}</h2><span class="text-xs text-ink-500">06:00 – 20:00</span></div>
          <div class="card-pad overflow-x-auto">
            <table class="text-2xs" role="grid">
              <tr><td></td>@for (h of hours; track h) { <td class="px-0.5 pb-1 text-center text-ink-400">{{ h }}</td> }</tr>
              @for (dw of days; track dw.n) {
                <tr>
                  <td class="pr-2 font-semibold text-ink-500">{{ L(dw.sw, dw.en) }}</td>
                  @for (h of hours; track h) {
                    <td class="p-0.5"><div class="h-5 w-5 rounded" [style.background]="heatColor(dw.n, h)" [title]="heatValue(dw.n, h) + ' tickets'"></div></td>
                  }
                </tr>
              }
            </table>
            <div class="mt-3 flex items-center gap-2 text-2xs text-ink-500">{{ L('Chache', 'Fewer') }}
              <span class="h-2.5 w-16 rounded-full bg-gradient-to-r from-brand-100 to-brand-600"></span>{{ L('Nyingi', 'More') }}</div>
          </div>
        </section>

        <section class="card">
          <div class="card-header"><h2 class="card-title">{{ t('kpi.staffPerf') }}</h2></div>
          <div class="table-wrap">
            <table class="w-full">
              <thead><tr><th class="table-th">{{ t('admin.staff') }}</th><th class="table-th text-right">{{ t('kpi.completed') }}</th><th class="table-th text-right">{{ t('kpi.avgService') }}</th><th class="table-th text-right">{{ t('kpi.avgWait') }}</th></tr></thead>
              <tbody>
                @for (s of d.staff; track s.userId) {
                  <tr><td class="table-td font-medium text-ink">{{ s.fullName }}</td><td class="table-td text-right tabular">{{ s.served }}</td>
                    <td class="table-td text-right tabular">{{ s.avgServiceMinutes ?? '—' }} {{ t('common.minutes') }}</td><td class="table-td text-right tabular">{{ s.avgWaitMinutes ?? '—' }} {{ t('common.minutes') }}</td></tr>
                } @empty {
                  <tr><td colspan="4" class="table-td py-8 text-center text-ink-500">{{ L('Hakuna data bado', 'No data yet') }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section class="card mt-6">
        <div class="card-header"><h2 class="card-title">{{ t('kpi.byService') }}</h2></div>
        <div class="table-wrap">
          <table class="w-full">
            <thead><tr><th class="table-th">{{ t('admin.services') }}</th><th class="table-th text-right">{{ t('kpi.tickets') }}</th><th class="table-th text-right">{{ t('kpi.completed') }}</th>
              <th class="table-th text-right">{{ t('kpi.avgWait') }}</th><th class="table-th text-right">{{ t('kpi.avgService') }}</th><th class="table-th text-right">{{ t('kpi.revenue') }}</th></tr></thead>
            <tbody>
              @for (s of d.services; track s.serviceId) {
                <tr><td class="table-td"><span class="mr-2 rounded-md bg-ink-100 px-1.5 py-0.5 font-mono text-2xs font-bold text-ink-600">{{ s.prefix }}</span><span class="font-medium text-ink">{{ s.name }}</span></td>
                  <td class="table-td text-right tabular">{{ s.tickets }}</td><td class="table-td text-right tabular">{{ s.completed }}</td>
                  <td class="table-td text-right tabular">{{ s.avgWaitMinutes ?? '—' }}</td><td class="table-td text-right tabular">{{ s.avgServiceMinutes ?? '—' }}</td>
                  <td class="table-td text-right font-semibold tabular text-ink">{{ fmtMoney(s.revenue) }}</td></tr>
              } @empty {
                <tr><td colspan="6" class="table-td py-8 text-center text-ink-500">{{ L('Hakuna data bado', 'No data yet') }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-6">@for (i of [1,2,3,4,5,6]; track i) { <div class="skeleton h-24"></div> }</div>
      <div class="skeleton mt-6 h-64"></div>
    }
  `
})
export class DashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly fmtMoney = (v: number) => money(v);
  protected readonly data = signal<Dashboard | null>(null);
  protected readonly range = signal(30);
  protected readonly ranges = [{ days: 1, sw: 'Leo', en: 'Today' }, { days: 7, sw: 'Siku 7', en: '7 days' }, { days: 30, sw: 'Siku 30', en: '30 days' }];
  protected readonly chartW = 720;
  protected readonly grid = [0, 0.25, 0.5, 0.75, 1];
  protected readonly hours = Array.from({ length: 15 }, (_, i) => i + 6); // 06:00-20:00
  protected readonly days = [
    { n: 1, sw: 'Jtt', en: 'Mon' }, { n: 2, sw: 'Jnn', en: 'Tue' }, { n: 3, sw: 'Jtn', en: 'Wed' }, { n: 4, sw: 'Alh', en: 'Thu' },
    { n: 5, sw: 'Ijm', en: 'Fri' }, { n: 6, sw: 'Jms', en: 'Sat' }, { n: 7, sw: 'Jpl', en: 'Sun' }
  ];
  protected from = this.iso(-29);
  protected to = this.iso(0);

  private readonly maxDaily = computed(() => Math.max(1, ...(this.data()?.daily ?? []).map(d => d.tickets)));
  private readonly heatMap = computed(() => {
    const m = new Map<string, number>();
    (this.data()?.peakHours ?? []).forEach(c => m.set(`${c.isoDow}-${c.hour}`, c.tickets));
    return m;
  });
  private readonly heatMax = computed(() => Math.max(1, ...this.heatMap().values()));
  protected readonly barStep = computed(() => this.chartW / Math.max(1, this.data()?.daily.length ?? 1));
  protected readonly labelEvery = computed(() => Math.ceil((this.data()?.daily.length ?? 1) / 10));

  protected readonly kpis = computed(() => {
    const s = this.data()?.summary;
    if (!s) return [];
    const m = this.t('common.minutes');
    return [
      { label: this.t('kpi.tickets'), value: String(s.totalTickets), icon: 'ticket', tone: 'bg-ink-100 text-ink-600' },
      { label: this.t('kpi.completed'), value: String(s.completed), icon: 'check-circle', tone: 'bg-brand-50 text-brand-700' },
      { label: this.t('kpi.avgWait'), value: `${s.avgWaitMinutes ?? '—'} ${m}`, icon: 'clock', tone: 'bg-accent-50 text-accent-600' },
      { label: this.t('kpi.avgService'), value: `${s.avgServiceMinutes ?? '—'} ${m}`, icon: 'desk', tone: 'bg-sky-50 text-sky-700' },
      { label: this.t('kpi.noShow'), value: `${s.noShowRate ?? 0}%`, icon: 'user-x', tone: 'bg-rose-50 text-rose-600' },
      { label: this.t('kpi.revenue'), value: money(s.revenue), icon: 'banknote', tone: 'bg-brand-50 text-brand-700' }
    ];
  });

  ngOnInit(): void { this.load(); }

  setRange(days: number): void {
    this.range.set(days);
    this.from = this.iso(-(days - 1));
    this.to = this.iso(0);
    this.load();
  }

  load(): void {
    this.http.get<Dashboard>(`${API}/admin/analytics/dashboard`, { params: { from: this.from, to: this.to } })
      .subscribe(d => this.data.set(d));
  }

  barH(v: number): number { return Math.round((v / this.maxDaily()) * 150); }
  heatValue(d: number, h: number): number { return this.heatMap().get(`${d}-${h}`) ?? 0; }
  heatColor(d: number, h: number): string {
    const v = this.heatValue(d, h);
    return v === 0 ? 'rgb(var(--ink-100))' : `rgba(19,125,90,${0.15 + 0.85 * (v / this.heatMax())})`;
  }

  private iso(offsetDays: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toLocaleDateString('en-CA'); // yyyy-mm-dd
  }
}
