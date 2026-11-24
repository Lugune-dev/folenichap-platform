import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API, toProblem } from '../../core/api';
import { money } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { ServiceView } from '../../core/models';
import { ToastService } from '../../core/toast.service';

import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-services',
    imports: [ReactiveFormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.services') }}</h1>
        <p class="page-subtitle">{{ sw() ? 'Huduma ambazo wateja wanaweza kuchagua, muda na ada zake.' : 'What customers can book, how long it takes and what it costs.' }}</p>
      </div>
      <button class="btn-primary" (click)="edit(null)"><fc-icon name="plus" [size]="16" [stroke]="2.25" />{{ sw() ? 'Ongeza huduma' : 'Add service' }}</button>
    </div>

    @if (editing() !== undefined) {
      <form class="card mb-6 animate-fade-up" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-header"><h2 class="card-title">{{ editing() ? (sw() ? 'Hariri huduma' : 'Edit service') : (sw() ? 'Huduma mpya' : 'New service') }}</h2>
          <button type="button" class="btn-icon h-8 w-8" (click)="editing.set(undefined)" [attr.aria-label]="t('common.close')"><fc-icon name="x" [size]="16" /></button></div>
        <div class="card-pad grid gap-5 sm:grid-cols-3">
          <div><label class="label" for="sn">Name (EN)</label><input id="sn" class="input" formControlName="name" placeholder="Dental Cleaning"></div>
          <div><label class="label" for="ssw">Jina (SW)</label><input id="ssw" class="input" formControlName="nameSw" placeholder="Kusafisha Meno"></div>
          <div><label class="label" for="sp">{{ sw() ? 'Herufi ya tiketi' : 'Ticket prefix' }}</label><input id="sp" class="input font-mono uppercase" formControlName="ticketPrefix" maxlength="5" placeholder="D">
            <p class="hint">{{ sw() ? 'Mfano: D → D-001' : 'Example: D → D-001' }}</p></div>
          <div><label class="label" for="sd">{{ sw() ? 'Muda wa wastani (dk)' : 'Avg. duration (min)' }}</label><input id="sd" class="input" type="number" min="1" formControlName="avgDurationMinutes"></div>
          <div><label class="label" for="sf">{{ sw() ? 'Ada (TZS)' : 'Fee (TZS)' }}</label><input id="sf" class="input" type="number" min="0" step="100" formControlName="feeAmount">
            <p class="hint">{{ sw() ? '0 = bure' : '0 = free' }}</p></div>
          <div><label class="label" for="so">{{ sw() ? 'Mpangilio' : 'Sort order' }}</label><input id="so" class="input" type="number" formControlName="sortOrder"></div>
          <div class="sm:col-span-3"><label class="label" for="sds">{{ sw() ? 'Maelezo' : 'Description' }}</label><input id="sds" class="input" formControlName="description"></div>
          <div class="flex flex-col gap-3 rounded-xl bg-ink-50 p-4 text-sm sm:col-span-3 sm:flex-row sm:gap-8">
            <label class="flex items-center gap-2.5 font-medium"><input type="checkbox" formControlName="requireUpfrontPayment"> {{ t('book.payRequired') }}</label>
            <label class="flex items-center gap-2.5 font-medium"><input type="checkbox" formControlName="active"> {{ t('common.active') }}</label>
          </div>
          <div class="grid gap-4 rounded-xl bg-ink-50 p-4 text-sm sm:col-span-3 sm:grid-cols-[1fr_200px] sm:items-center">
            <div>
              <label class="flex items-center gap-2.5 font-medium"><input type="checkbox" formControlName="allowAppointments"> {{ sw() ? 'Wateja wanaweza kuweka miadi ya muda maalum' : 'Customers can book a time in advance' }}</label>
              <p class="hint ml-6">{{ sw() ? 'Kila nafasi ni sawa na muda wa wastani, ndani ya saa za kazi za tawi.' : 'Each slot is as long as the average duration, within the branch opening hours.' }}</p>
            </div>
            <div><label class="label" for="scap">{{ sw() ? 'Wateja kwa nafasi moja' : 'Bookings per slot' }}</label>
              <input id="scap" class="input" type="number" min="1" max="50" formControlName="slotCapacity">
              <p class="hint">{{ sw() ? 'Mfano: idadi ya madaktari/viti' : 'E.g. number of doctors or chairs' }}</p></div>
          </div>
        </div>
        <div class="flex justify-end gap-2 border-t border-ink-100 px-5 py-4 sm:px-6">
          <button type="button" class="btn-secondary" (click)="editing.set(undefined)">{{ t('common.cancel') }}</button>
          <button class="btn-primary" [disabled]="form.invalid">{{ t('common.save') }}</button>
        </div>
      </form>
    }

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr><th class="table-th w-16">{{ sw() ? 'Herufi' : 'Prefix' }}</th><th class="table-th">{{ t('admin.services') }}</th><th class="table-th">{{ sw() ? 'Muda' : 'Duration' }}</th>
            <th class="table-th">{{ t('book.fee') }}</th><th class="table-th">{{ sw() ? 'Hali' : 'Status' }}</th><th class="table-th"></th></tr></thead>
          <tbody>
            @for (s of services(); track s.id) {
              <tr [class.opacity-60]="!s.active" class="transition hover:bg-ink-50/50">
                <td class="table-td"><span class="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-night-900 px-2 font-mono text-xs font-bold text-white">{{ s.ticketPrefix }}</span></td>
                <td class="table-td"><p class="font-semibold text-ink">{{ s.name }}</p><p class="text-xs text-ink-500">{{ s.nameSw }}</p></td>
                <td class="table-td tabular">{{ s.avgDurationMinutes }} {{ t('common.minutes') }}</td>
                <td class="table-td"><span class="font-semibold tabular text-ink">{{ s.feeAmount > 0 ? fmt(s.feeAmount) : t('book.free') }}</span>
                  @if (s.requireUpfrontPayment) { <span class="badge-warning ml-2">{{ sw() ? 'Kabla' : 'Upfront' }}</span> }
                  @if (s.allowAppointments) { <span class="badge-info ml-2">{{ t('admin.appointments') }} ×{{ s.slotCapacity }}</span> }</td>
                <td class="table-td">@if (s.active) { <span class="badge-success"><span class="dot"></span>{{ t('common.active') }}</span> } @else { <span class="badge-neutral"><span class="dot"></span>{{ t('common.inactive') }}</span> }</td>
                <td class="table-td text-right"><button class="btn-ghost btn-sm" (click)="edit(s)"><fc-icon name="edit" [size]="14" />{{ t('common.edit') }}</button></td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="table-td py-12 text-center text-ink-500">{{ sw() ? 'Bado hakuna huduma. Ongeza ya kwanza.' : 'No services yet. Add your first one.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class ServicesComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly sw = this.i18n.isSw;
  protected readonly fmt = (v: number) => money(v);
  protected readonly services = signal<ServiceView[]>([]);
  /** undefined = closed, null = new, ServiceView = editing */
  protected readonly editing = signal<ServiceView | null | undefined>(undefined);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required], nameSw: [''], description: [''],
    ticketPrefix: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9]{1,5}$/)]],
    avgDurationMinutes: [15, [Validators.required, Validators.min(1), Validators.max(600)]],
    feeAmount: [0, [Validators.required, Validators.min(0)]],
    requireUpfrontPayment: [false], sortOrder: [0], active: [true],
    allowAppointments: [false], slotCapacity: [1, [Validators.required, Validators.min(1), Validators.max(50)]]
  });

  ngOnInit(): void { this.load(); }

  load(): void { this.http.get<ServiceView[]>(`${API}/admin/services`).subscribe(s => this.services.set(s)); }

  edit(s: ServiceView | null): void {
    this.editing.set(s);
    this.form.reset(s ? {
      name: s.name, nameSw: s.nameSw ?? '', description: s.description ?? '', ticketPrefix: s.ticketPrefix,
      avgDurationMinutes: s.avgDurationMinutes, feeAmount: s.feeAmount, requireUpfrontPayment: s.requireUpfrontPayment,
      sortOrder: s.sortOrder, active: s.active, allowAppointments: s.allowAppointments, slotCapacity: s.slotCapacity
    } : undefined);
  }

  save(): void {
    const s = this.editing();
    const body = { ...this.form.getRawValue(), ticketPrefix: this.form.getRawValue().ticketPrefix.toUpperCase() };
    const req = s ? this.http.put<ServiceView>(`${API}/admin/services/${s.id}`, body) : this.http.post<ServiceView>(`${API}/admin/services`, body);
    req.subscribe({
      next: () => { this.toast.success(this.i18n.isSw() ? 'Imehifadhiwa' : 'Saved'); this.editing.set(undefined); this.load(); },
      error: err => { const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }
}
