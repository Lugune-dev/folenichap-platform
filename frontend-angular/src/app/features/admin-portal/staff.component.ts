import { isStrongPassword, strongPassword } from '../../core/validators';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { API, toProblem } from '../../core/api';
import { dateTime } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { BranchView, StaffView } from '../../core/models';
import { ToastService } from '../../core/toast.service';

import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-staff',
    imports: [ReactiveFormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.staff') }}</h1>
        <p class="page-subtitle">{{ i18n.isSw() ? 'Watu wanaohudumia wateja na wanaosimamia biashara.' : 'People who serve customers and manage the business.' }}</p>
      </div>
      <button class="btn-primary" (click)="edit(null)"><fc-icon name="plus" [size]="16" [stroke]="2.25" />{{ i18n.isSw() ? 'Ongeza mfanyakazi' : 'Add staff member' }}</button>
    </div>

    @if (editing() !== undefined) {
      <form class="card mb-6 animate-fade-up" [formGroup]="form" (ngSubmit)="save()">
        <div class="card-header"><h2 class="card-title">{{ editing() ? (i18n.isSw() ? 'Hariri mfanyakazi' : 'Edit staff member') : (i18n.isSw() ? 'Mfanyakazi mpya' : 'New staff member') }}</h2>
          <button type="button" class="btn-icon h-8 w-8" (click)="editing.set(undefined)" [attr.aria-label]="t('common.close')"><fc-icon name="x" [size]="16" /></button></div>
        <div class="card-pad grid gap-5 sm:grid-cols-3">
          <div><label class="label" for="fn">{{ i18n.isSw() ? 'Jina kamili' : 'Full name' }}</label><input id="fn" class="input" formControlName="fullName"></div>
          <div><label class="label" for="fe">{{ t('auth.email') }}</label><input id="fe" class="input" type="email" formControlName="email" [readonly]="!!editing()"></div>
          <div><label class="label" for="fp">{{ t('auth.phone') }}</label><input id="fp" class="input" formControlName="phone" inputmode="tel"></div>
          @if (!editing()) {
            <div><label class="label" for="fpw">{{ t('auth.password') }}</label><input id="fpw" class="input" type="password" formControlName="password" autocomplete="new-password">
              <p class="hint">{{ i18n.isSw() ? 'Herufi 10+, A-Z, a-z na namba' : '10+ characters with A-Z, a-z and a number' }}</p></div>
          }
          <div><label class="label" for="fc">{{ t('desk.counter') }}</label><input id="fc" class="input" formControlName="counterLabel" placeholder="Chumba 1 / Room 1"></div>
          <div><label class="label" for="fb">{{ t('book.branch') }}</label>
            <select id="fb" class="input" formControlName="branchId"><option value="">—</option>
              @for (b of branches(); track b.id) { <option [value]="b.id">{{ b.name }}</option> }</select></div>
          <div><label class="label" for="fr">{{ i18n.isSw() ? 'Wadhifa' : 'Role' }}</label>
            <select id="fr" class="input" formControlName="role"><option value="STAFF">{{ i18n.isSw() ? 'Mhudumu' : 'Staff' }}</option><option value="TENANT_ADMIN">{{ i18n.isSw() ? 'Msimamizi' : 'Admin' }}</option></select></div>
          <div><label class="label" for="fl">Lugha / Language</label>
            <select id="fl" class="input" formControlName="language"><option value="sw">Kiswahili</option><option value="en">English</option></select></div>
          @if (editing()) { <label class="flex items-center gap-2.5 self-end pb-3 text-sm font-medium"><input type="checkbox" formControlName="active"> {{ t('common.active') }}</label> }
        </div>
        <div class="flex flex-wrap justify-end gap-2 border-t border-ink-100 px-5 py-4 sm:px-6">
          @if (editing(); as u) { <button type="button" class="btn-ghost mr-auto" (click)="resetPassword(u)"><fc-icon name="key" [size]="15" />{{ i18n.isSw() ? 'Badilisha nenosiri' : 'Reset password' }}</button> }
          <button type="button" class="btn-secondary" (click)="editing.set(undefined)">{{ t('common.cancel') }}</button>
          <button class="btn-primary" [disabled]="form.invalid">{{ t('common.save') }}</button>
        </div>
      </form>
    }

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr><th class="table-th">{{ i18n.isSw() ? 'Jina' : 'Name' }}</th><th class="table-th">{{ i18n.isSw() ? 'Wadhifa' : 'Role' }}</th><th class="table-th">{{ t('desk.counter') }}</th>
            <th class="table-th">{{ i18n.isSw() ? 'Aliingia mwisho' : 'Last sign-in' }}</th><th class="table-th"></th></tr></thead>
          <tbody>
            @for (u of staff(); track u.id) {
              <tr [class.opacity-60]="!u.active" class="transition hover:bg-ink-50/50">
                <td class="table-td"><div class="flex items-center gap-3">
                  <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-800">{{ initials(u.fullName) }}</span>
                  <div class="min-w-0"><p class="truncate font-semibold text-ink">{{ u.fullName }}</p><p class="truncate text-xs text-ink-500">{{ u.email }}</p></div></div></td>
                <td class="table-td">@if (u.role === 'TENANT_ADMIN') { <span class="badge-info">{{ i18n.isSw() ? 'Msimamizi' : 'Admin' }}</span> } @else { <span class="badge-neutral">{{ i18n.isSw() ? 'Mhudumu' : 'Staff' }}</span> }
                  @if (!u.active) { <span class="badge-danger ml-1">{{ t('common.inactive') }}</span> }</td>
                <td class="table-td">{{ u.counterLabel ?? '—' }}</td>
                <td class="table-td tabular text-ink-500">{{ fmt(u.lastLoginAt) }}</td>
                <td class="table-td text-right"><button class="btn-ghost btn-sm" (click)="edit(u)"><fc-icon name="edit" [size]="14" />{{ t('common.edit') }}</button></td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class StaffComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly fmt = dateTime;
  protected readonly staff = signal<StaffView[]>([]);
  protected readonly branches = signal<BranchView[]>([]);
  protected readonly editing = signal<StaffView | null | undefined>(undefined);

  protected readonly form = this.fb.nonNullable.group({
    fullName: ['', Validators.required], email: ['', [Validators.required, Validators.email]], phone: [''],
    password: [''], counterLabel: [''], branchId: [''], role: ['STAFF'], language: ['sw'], active: [true]
  });

  ngOnInit(): void {
    this.load();
    this.http.get<BranchView[]>(`${API}/admin/branches`).subscribe(b => this.branches.set(b));
  }

  load(): void { this.http.get<StaffView[]>(`${API}/admin/staff`).subscribe(s => this.staff.set(s)); }

  edit(u: StaffView | null): void {
    this.editing.set(u);
    this.form.reset(u ? { fullName: u.fullName, email: u.email, phone: u.phone ?? '', password: '', counterLabel: u.counterLabel ?? '',
      branchId: u.branchId ?? '', role: u.role, language: u.language, active: u.active } : undefined);
    const pw = this.form.controls.password;
    pw.setValidators(u ? [] : [Validators.required, strongPassword]);
    pw.updateValueAndValidity();
  }

  save(): void {
    const u = this.editing();
    const v = this.form.getRawValue();
    const body = { ...v, branchId: v.branchId || null, phone: v.phone || null };
    const req = u ? this.http.put(`${API}/admin/staff/${u.id}`, body) : this.http.post(`${API}/admin/staff`, body);
    req.subscribe({
      next: () => { this.toast.success(this.i18n.isSw() ? 'Imehifadhiwa' : 'Saved'); this.editing.set(undefined); this.load(); },
      error: err => { const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }

  resetPassword(u: StaffView): void {
    const password = prompt('New password (10+ characters, with A-Z, a-z and 0-9)');
    if (!password) return;
    if (!isStrongPassword(password)) { this.toast.error('Password: 10+ characters, with A-Z, a-z and 0-9'); return; }
    this.http.post(`${API}/admin/staff/${u.id}/reset-password`, { password }).subscribe({
      next: () => this.toast.success(this.i18n.isSw() ? 'Imehifadhiwa' : 'Saved'),
      error: err => { const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }

  protected initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  }
}
