import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API, toProblem } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { dateTime, money } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { PlatformMetrics, TenantSummary } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';

/** Platform owner console: tenants lifecycle, MRR, credits and gateway health. */
import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-super-dashboard',
    imports: [FormsModule, LangSwitchComponent, ThemeToggleComponent, LogoComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <header class="sticky top-0 z-20 border-b border-ink-200 bg-surface/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <fc-logo /><span class="badge bg-night-900 text-white ring-night-900"><fc-icon name="shield" [size]="12" />Platform owner</span>
        <div class="ml-auto flex items-center gap-2"><fc-theme-toggle /><fc-lang-switch />
          <button class="btn-icon" (click)="auth.logout()" [attr.aria-label]="i18n.t('common.logout')" [title]="i18n.t('common.logout')"><fc-icon name="logout" [size]="18" /></button></div>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div class="page-header">
        <div><p class="eyebrow">Super admin</p><h1 class="page-title">{{ i18n.isSw() ? 'Muhtasari wa jukwaa' : 'Platform overview' }}</h1></div>
      </div>
      @if (metrics(); as m) {
        <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          @for (k of cards(); track k.label) {
            <div class="stat" [class.ring-2]="k.alert" [class.ring-rose-300]="k.alert">
              <p class="stat-label">{{ k.label }}</p><p class="stat-value text-xl">{{ k.value }}</p>
            </div>
          }
        </div>
        <p class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span class="flex items-center gap-1.5"><fc-icon name="wallet" [size]="13" />Gateway: <b class="text-ink">{{ m.paymentGateway }}</b></span>
          <span class="flex items-center gap-1.5"><fc-icon name="clock" [size]="13" />Last webhook: {{ fmt(m.lastWebhookAt) }}</span>
          <span class="flex items-center gap-1.5"><fc-icon name="wifi" [size]="13" />Live connections: {{ m.liveConnections }}</span>
        </p>
      }

      <section class="card mt-8 overflow-hidden">
        <div class="card-header flex-wrap">
          <h2 class="card-title">Tenants <span class="ml-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600 tabular">{{ filtered().length }}</span></h2>
          <div class="flex flex-wrap gap-2">
            <div class="relative"><fc-icon name="search" [size]="16" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input class="input h-9 w-60 pl-9 text-sm" [(ngModel)]="query" [placeholder]="i18n.t('common.search')"></div>
            <select class="input h-9 w-44 text-sm" [(ngModel)]="statusFilter">
              <option value="">All statuses</option>
              @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
            </select>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead><tr><th class="table-th">Business</th><th class="table-th">Plan</th><th class="table-th">Status</th><th class="table-th">Trial / Period</th>
              <th class="table-th text-right">Tickets 30d</th><th class="table-th text-right">Staff</th><th class="table-th text-right">Credits</th><th class="table-th">Actions</th></tr></thead>
            <tbody>
              @for (tn of filtered(); track tn.id) {
                <tr class="transition hover:bg-ink-50/50">
                  <td class="table-td"><p class="font-semibold text-ink">{{ tn.businessName }}</p>
                    <a class="font-mono text-2xs text-brand-700 hover:underline" [href]="'/b/' + tn.slug" target="_blank" rel="noopener">/b/{{ tn.slug }}</a>
                    <p class="text-2xs text-ink-500">{{ tn.email }} · {{ tn.phone }}</p></td>
                  <td class="table-td"><select class="input h-8 w-28 text-xs" [ngModel]="tn.plan" (ngModelChange)="setPlan(tn, $event)" aria-label="Plan">
                    <option value="STARTER">STARTER</option><option value="PRO">PRO</option></select></td>
                  <td class="table-td"><span [class]="statusCls(tn.status)"><span class="dot"></span>{{ tn.status }}</span></td>
                  <td class="table-td whitespace-nowrap text-xs tabular">{{ tn.status === 'TRIAL' ? fmt(tn.trialEndsAt) : fmt(tn.currentPeriodEndsAt) }}</td>
                  <td class="table-td text-right tabular">{{ tn.ticketsLast30d }}</td><td class="table-td text-right tabular">{{ tn.staffCount }}</td><td class="table-td text-right tabular">{{ tn.smsCredits }}</td>
                  <td class="table-td">
                    <div class="flex flex-wrap gap-1">
                      @if (tn.status === 'PENDING_APPROVAL') { <button class="btn-primary btn-sm" (click)="setStatus(tn, 'TRIAL')">Approve</button> }
                      @if (tn.status !== 'ACTIVE') { <button class="btn-secondary btn-sm" (click)="setStatus(tn, 'ACTIVE')">Activate</button> }
                      @if (tn.status !== 'SUSPENDED') { <button class="btn-danger-ghost btn-sm" (click)="setStatus(tn, 'SUSPENDED')">Suspend</button> }
                      <button class="btn-ghost btn-sm" (click)="extend(tn)">+Trial</button>
                      <button class="btn-ghost btn-sm" (click)="credits(tn)">+Credits</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    </main>
  `
})
export class SuperDashboardComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  protected readonly fmt = dateTime;
  protected readonly metrics = signal<PlatformMetrics | null>(null);
  protected readonly tenants = signal<TenantSummary[]>([]);
  protected readonly statuses = ['PENDING_APPROVAL', 'TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'];
  private readonly q = signal('');
  private readonly sf = signal('');

  get query(): string { return this.q(); }
  set query(v: string) { this.q.set(v); }
  get statusFilter(): string { return this.sf(); }
  set statusFilter(v: string) { this.sf.set(v); }

  protected readonly filtered = computed(() => {
    const q = this.q().toLowerCase();
    const s = this.sf();
    return this.tenants().filter(t => (!s || t.status === s)
      && (!q || `${t.businessName} ${t.slug} ${t.email} ${t.phone}`.toLowerCase().includes(q)));
  });

  protected readonly cards = computed(() => {
    const m = this.metrics();
    if (!m) return [];
    return [
      { label: 'MRR', value: money(m.mrr), alert: false },
      { label: 'Collected 30d', value: money(m.collectedLast30d), alert: false },
      { label: 'Active', value: String(m.activeTenants), alert: false },
      { label: 'Trial', value: String(m.trialTenants), alert: false },
      { label: 'Pending', value: String(m.pendingApproval), alert: m.pendingApproval > 0 },
      { label: 'Suspended', value: String(m.suspendedTenants), alert: false },
      { label: 'Tickets today', value: String(m.ticketsToday), alert: false },
      { label: 'Pay fail 24h', value: `${m.paymentsFailed24h}/${m.payments24h}`, alert: m.payments24h > 5 && m.paymentsFailed24h / m.payments24h > 0.3 }
    ];
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<PlatformMetrics>(`${API}/super/metrics`).subscribe(m => this.metrics.set(m));
    this.http.get<TenantSummary[]>(`${API}/super/tenants`).subscribe(t => this.tenants.set(t));
  }

  setStatus(tn: TenantSummary, status: string): void {
    if (status === 'SUSPENDED' && !confirm(`Suspend ${tn.businessName}?`)) return;
    this.patch(`${API}/super/tenants/${tn.id}/status`, { status });
  }

  setPlan(tn: TenantSummary, plan: string): void { this.patch(`${API}/super/tenants/${tn.id}/plan`, { plan }); }

  extend(tn: TenantSummary): void {
    const days = Number(prompt('Extend trial by how many days?', '7'));
    if (days > 0) this.post(`${API}/super/tenants/${tn.id}/extend-trial`, { days });
  }

  credits(tn: TenantSummary): void {
    const credits = Number(prompt('Add how many message credits?', '100'));
    if (credits > 0) this.post(`${API}/super/tenants/${tn.id}/credits`, { credits });
  }

  statusCls(s: string): string {
    return ({ ACTIVE: 'badge-success', TRIAL: 'badge-info', PAST_DUE: 'badge-warning', SUSPENDED: 'badge-danger',
      PENDING_APPROVAL: 'badge bg-violet-50 text-violet-800 ring-violet-200' } as Record<string, string>)[s] ?? 'badge-neutral';
  }

  private patch(url: string, body: unknown): void {
    this.http.patch(url, body).subscribe({ next: () => { this.toast.success('Saved'); this.load(); }, error: e => this.fail(e) });
  }

  private post(url: string, body: unknown): void {
    this.http.post(url, body).subscribe({ next: () => { this.toast.success('Saved'); this.load(); }, error: e => this.fail(e) });
  }

  private fail(err: unknown): void {
    const p = toProblem(err);
    this.toast.error(this.i18n.error(p.code, p.detail));
  }
}
