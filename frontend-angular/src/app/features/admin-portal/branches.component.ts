import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { API, toProblem } from '../../core/api';
import { I18nService } from '../../core/i18n.service';
import { BranchView, DayHours } from '../../core/models';
import { ToastService } from '../../core/toast.service';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

interface Draft { id?: string; name: string; address: string; phone: string; active: boolean; main: boolean;
  hours: Record<string, { on: boolean; open: string; close: string }>; }

import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-branches',
    imports: [FormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.branches') }}</h1>
        <p class="page-subtitle">{{ i18n.isSw() ? 'Maeneo yako na saa zake za kazi.' : 'Your locations and their opening hours.' }}</p>
      </div>
      <button class="btn-primary" (click)="edit(null)"><fc-icon name="plus" [size]="16" [stroke]="2.25" />{{ i18n.isSw() ? 'Ongeza tawi' : 'Add branch' }}</button>
    </div>

    @if (draft(); as d) {
      <form class="card mb-6 animate-fade-up" (ngSubmit)="save(d)">
        <div class="card-header"><h2 class="card-title">{{ d.name || (i18n.isSw() ? 'Tawi jipya' : 'New branch') }}</h2>
          <button type="button" class="btn-icon h-8 w-8" (click)="draft.set(null)" [attr.aria-label]="t('common.close')"><fc-icon name="x" [size]="16" /></button></div>
        <div class="card-pad space-y-6">
          <div class="grid gap-5 sm:grid-cols-3">
            <div><label class="label" for="bn">{{ i18n.isSw() ? 'Jina' : 'Name' }}</label><input id="bn" class="input" name="n" [(ngModel)]="d.name" required></div>
            <div><label class="label" for="ba">{{ i18n.isSw() ? 'Anwani' : 'Address' }}</label><input id="ba" class="input" name="a" [(ngModel)]="d.address"></div>
            <div><label class="label" for="bp">{{ t('auth.phone') }}</label><input id="bp" class="input" name="p" [(ngModel)]="d.phone" inputmode="tel"></div>
          </div>
          <div>
            <p class="label">{{ i18n.isSw() ? 'Saa za kazi' : 'Opening hours' }}</p>
            <p class="hint -mt-1 mb-3">{{ i18n.isSw() ? 'Ukiacha siku zote zimezimwa, tawi litakuwa wazi muda wote.' : 'Leave every day off to stay open all the time.' }}</p>
            <div class="divide-y divide-ink-100 rounded-xl border border-ink-200">
              @for (day of days; track day) {
                <div class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <label class="flex w-20 items-center gap-2 font-medium"><input type="checkbox" [name]="day + 'on'" [(ngModel)]="d.hours[day].on"> {{ day }}</label>
                  <input type="time" class="input h-9 w-32" [name]="day + 'o'" [(ngModel)]="d.hours[day].open" [disabled]="!d.hours[day].on" [attr.aria-label]="day + ' open'">
                  <span class="text-ink-400">–</span>
                  <input type="time" class="input h-9 w-32" [name]="day + 'c'" [(ngModel)]="d.hours[day].close" [disabled]="!d.hours[day].on" [attr.aria-label]="day + ' close'">
                  @if (!d.hours[day].on) { <span class="text-xs text-ink-400">{{ i18n.isSw() ? 'Imefungwa' : 'Closed' }}</span> }
                </div>
              }
            </div>
          </div>
          @if (!d.main) { <label class="flex items-center gap-2.5 text-sm font-medium"><input type="checkbox" name="act" [(ngModel)]="d.active"> {{ t('common.active') }}</label> }
        </div>
        <div class="flex justify-end gap-2 border-t border-ink-100 px-5 py-4 sm:px-6">
          <button type="button" class="btn-secondary" (click)="draft.set(null)">{{ t('common.cancel') }}</button>
          <button class="btn-primary">{{ t('common.save') }}</button>
        </div>
      </form>
    }

    <div class="grid gap-4 sm:grid-cols-2">
      @for (b of branches(); track b.id) {
        <div class="card card-pad transition hover:shadow-lift" [class.opacity-60]="!b.active">
          <div class="flex items-start justify-between gap-3">
            <div class="flex gap-3">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"><fc-icon name="building" [size]="20" /></span>
              <div><p class="flex items-center gap-2 font-semibold text-ink">{{ b.name }} @if (b.main) { <span class="badge-success">{{ i18n.isSw() ? 'Kuu' : 'Main' }}</span> }</p>
                <p class="text-sm text-ink-500">{{ b.address || '—' }}</p></div>
            </div>
            <button class="btn-ghost btn-sm" (click)="edit(b)"><fc-icon name="edit" [size]="14" />{{ t('common.edit') }}</button>
          </div>
          <p class="mt-4 flex items-start gap-2 text-sm text-ink-600"><fc-icon name="clock" [size]="15" class="mt-0.5 text-ink-400" />{{ hoursSummary(b.operatingHours) }}</p>
          <p class="mt-2 flex items-center gap-2 break-all font-mono text-2xs text-ink-400"><fc-icon name="tv" [size]="13" />/tv/…?branch={{ b.id }}</p>
        </div>
      }
    </div>
  `
})
export class BranchesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly days = DAYS;
  protected readonly branches = signal<BranchView[]>([]);
  protected readonly draft = signal<Draft | null>(null);

  ngOnInit(): void { this.load(); }

  load(): void { this.http.get<BranchView[]>(`${API}/admin/branches`).subscribe(b => this.branches.set(b)); }

  edit(b: BranchView | null): void {
    const hours: Draft['hours'] = {};
    DAYS.forEach(d => {
      const h = b?.operatingHours?.[d];
      hours[d] = { on: !!h, open: h?.open ?? '08:00', close: h?.close ?? '18:00' };
    });
    this.draft.set({ id: b?.id, name: b?.name ?? '', address: b?.address ?? '', phone: b?.phone ?? '',
      active: b?.active ?? true, main: b?.main ?? false, hours });
  }

  save(d: Draft): void {
    const operatingHours: DayHours = {};
    Object.entries(d.hours).filter(([, h]) => h.on).forEach(([day, h]) => (operatingHours[day] = { open: h.open, close: h.close }));
    const body = { name: d.name, address: d.address || null, phone: d.phone || null, operatingHours, active: d.active };
    const req = d.id ? this.http.put(`${API}/admin/branches/${d.id}`, body) : this.http.post(`${API}/admin/branches`, body);
    req.subscribe({
      next: () => { this.toast.success(this.i18n.isSw() ? 'Imehifadhiwa' : 'Saved'); this.draft.set(null); this.load(); },
      error: err => { const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }

  hoursSummary(h: DayHours): string {
    const keys = Object.keys(h ?? {});
    if (keys.length === 0) return this.i18n.isSw() ? 'Wazi muda wote' : 'Always open';
    return keys.map(k => `${k} ${h[k].open}-${h[k].close}`).join(' · ');
  }
}
