import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import * as QRCode from 'qrcode';
import { API, toProblem } from '../../core/api';
import { dateTime } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { MobileProvider, ProfileView } from '../../core/models';
import { ToastService } from '../../core/toast.service';

/** Business profile, bilingual greetings, printable QR desk stand, subscription payment. */
import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-settings',
    imports: [ReactiveFormsModule, FormsModule, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header no-print">
      <div>
        <h1 class="page-title">{{ t('admin.settings') }}</h1>
        <p class="page-subtitle">{{ i18n.isSw() ? 'Wasifu wa biashara, QR ya wateja na usajili wako.' : 'Business profile, customer QR code and your subscription.' }}</p>
      </div>
    </div>

    @if (profile(); as p) {
      <div class="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <form class="card no-print" [formGroup]="form" (ngSubmit)="save()">
          <div class="card-header"><h2 class="card-title">{{ i18n.isSw() ? 'Wasifu wa biashara' : 'Business profile' }}</h2></div>
          <div class="card-pad grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2"><label class="label" for="sbn">{{ t('auth.business') }}</label><input id="sbn" class="input" formControlName="businessName"></div>
            <div><label class="label" for="sph">{{ t('auth.phone') }}</label><input id="sph" class="input" formControlName="phone" inputmode="tel"></div>
            <div><label class="label" for="slg">{{ i18n.isSw() ? 'Kiungo cha nembo (logo)' : 'Logo URL' }}</label><input id="slg" class="input" formControlName="logoUrl" placeholder="https://…">
              <p class="hint">{{ i18n.isSw() ? 'Lazima ianze na https://' : 'Must start with https://' }}</p></div>
            <div class="sm:col-span-2"><label class="label" for="sgs">Ujumbe wa kukaribisha (SW)</label><textarea id="sgs" class="input" rows="2" formControlName="greetingSw"></textarea></div>
            <div class="sm:col-span-2"><label class="label" for="sge">Welcome message (EN)</label><textarea id="sge" class="input" rows="2" formControlName="greetingEn"></textarea></div>
            <div><label class="label" for="sdl">{{ i18n.isSw() ? 'Lugha ya msingi' : 'Default language' }}</label>
              <select id="sdl" class="input" formControlName="defaultLanguage"><option value="sw">Kiswahili</option><option value="en">English</option></select></div>
          </div>
          <div class="flex justify-end border-t border-ink-100 px-5 py-4 sm:px-6"><button class="btn-primary" [disabled]="form.invalid">{{ t('common.save') }}</button></div>
        </form>

        <!-- Printable QR stand -->
        <div class="card overflow-hidden text-center print:border-0 print:shadow-none">
          <div class="bg-gradient-to-br from-brand-700 to-brand-900 px-6 py-5 text-white print:bg-none print:text-ink">
            <p class="text-xl font-bold">{{ p.businessName }}</p>
            <p class="mt-1 text-sm text-brand-100 print:text-ink-500">{{ i18n.isSw() ? 'Scan kupata namba ya foleni' : 'Scan to join the queue' }}</p>
          </div>
          <div class="p-6">
            @if (qr()) { <img [src]="qr()" alt="QR code" class="mx-auto h-56 w-56 rounded-xl"> } @else { <div class="skeleton mx-auto h-56 w-56"></div> }
            <p class="mt-3 break-all font-mono text-xs text-ink-500">{{ p.publicUrl }}</p>
            <p class="mt-3 text-xs font-medium text-ink-500">M-Pesa · Mixx by Yas · Airtel Money · HaloPesa</p>
            <div class="mt-5 flex justify-center gap-2 no-print">
              <button class="btn-secondary btn-sm" (click)="print()"><fc-icon name="print" [size]="14" />{{ t('common.print') }}</button>
              <a class="btn-secondary btn-sm" [href]="qr()" [attr.download]="p.slug + '-qr.png'"><fc-icon name="download" [size]="14" />PNG</a>
            </div>
          </div>
        </div>
      </div>

      <div class="mt-6 grid gap-6 md:grid-cols-2 no-print">
        <section class="card">
          <div class="card-header"><h2 class="card-title">{{ i18n.isSw() ? 'Viungo vya kushiriki' : 'Links to share' }}</h2></div>
          <dl class="divide-y divide-ink-100">
            @for (l of links(p); track l.label) {
              <div class="flex items-center gap-3 px-5 py-3.5 sm:px-6">
                <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600"><fc-icon [name]="l.icon" [size]="16" /></span>
                <div class="min-w-0 flex-1"><dt class="text-xs font-medium text-ink-500">{{ l.label }}</dt>
                  <dd class="truncate font-mono text-xs text-ink">@if (l.href) { <a class="text-brand-700 hover:underline" [href]="l.href" target="_blank" rel="noopener">{{ l.value }}</a> } @else { {{ l.value }} }</dd></div>
                <button type="button" class="btn-icon h-8 w-8" (click)="copy(l.value)" [attr.aria-label]="i18n.isSw() ? 'Nakili' : 'Copy'"><fc-icon name="copy" [size]="15" /></button>
              </div>
            }
          </dl>
        </section>

        <section class="card">
          <div class="card-header"><h2 class="card-title">{{ i18n.isSw() ? 'Usajili' : 'Subscription' }}</h2>
            <span [class]="p.status === 'ACTIVE' ? 'badge-success' : p.status === 'TRIAL' ? 'badge-info' : 'badge-warning'"><span class="dot"></span>{{ p.status }}</span></div>
          <div class="card-pad">
            <dl class="grid grid-cols-2 gap-4 text-sm">
              <div><dt class="text-ink-500">{{ i18n.isSw() ? 'Mpango' : 'Plan' }}</dt><dd class="mt-0.5 font-semibold">{{ p.plan }} <span class="font-normal text-ink-400">({{ p.effectivePlan }})</span></dd></div>
              <div><dt class="text-ink-500">{{ t('plan.credits') }}</dt><dd class="mt-0.5 font-semibold tabular">{{ p.smsCredits }}</dd></div>
              @if (p.status === 'TRIAL') { <div><dt class="text-ink-500">{{ t('plan.trialEnds') }}</dt><dd class="mt-0.5 font-semibold">{{ fmt(p.trialEndsAt) }}</dd></div> }
              @if (p.currentPeriodEndsAt) { <div><dt class="text-ink-500">{{ i18n.isSw() ? 'Imelipiwa hadi' : 'Paid until' }}</dt><dd class="mt-0.5 font-semibold">{{ fmt(p.currentPeriodEndsAt) }}</dd></div> }
            </dl>
            <div class="mt-6 space-y-3 rounded-xl bg-ink-50 p-4">
              <p class="text-sm font-semibold">{{ i18n.isSw() ? 'Lipia usajili kwa simu' : 'Pay your subscription by mobile money' }}</p>
              <div class="grid grid-cols-2 gap-2">
                <select class="input" [(ngModel)]="subPlan" [attr.aria-label]="i18n.isSw() ? 'Mpango' : 'Plan'"><option value="STARTER">Starter · 35,000</option><option value="PRO">Pro · 75,000</option></select>
                <select class="input" [(ngModel)]="subProvider" [attr.aria-label]="i18n.isSw() ? 'Mtandao' : 'Network'">
                  <option value="MPESA">M-Pesa</option><option value="TIGOPESA">Mixx by Yas</option><option value="AIRTEL">Airtel Money</option><option value="HALOPESA">HaloPesa</option>
                </select>
                <input class="input col-span-2" [(ngModel)]="subPhone" placeholder="0712 345 678" inputmode="tel" [attr.aria-label]="t('auth.phone')">
              </div>
              <button class="btn-primary w-full" [disabled]="paying() || !subPhone" (click)="paySubscription()"><fc-icon name="phone" [size]="16" />{{ t('plan.upgrade') }}</button>
              <p class="flex items-start gap-1.5 text-xs text-ink-500"><fc-icon name="lock" [size]="13" class="mt-px" />{{ i18n.isSw() ? 'Utaombwa PIN kwenye simu yako. Hatuoni wala kuhifadhi PIN yako.' : 'You will be asked for your PIN on your phone. We never see or store it.' }}</p>
            </div>
          </div>
        </section>
      </div>
    }
  `
})
export class SettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly fmt = dateTime;
  protected readonly profile = signal<ProfileView | null>(null);
  protected readonly qr = signal<string>('');
  protected readonly paying = signal(false);

  protected subPlan: 'STARTER' | 'PRO' = 'PRO';
  protected subProvider: MobileProvider = 'MPESA';
  protected subPhone = '';

  protected readonly form = this.fb.nonNullable.group({
    businessName: ['', Validators.required], phone: ['', Validators.required], logoUrl: [''],
    greetingSw: [''], greetingEn: [''], defaultLanguage: ['sw'], businessCategory: ['']
  });

  ngOnInit(): void { this.load(); }

  private load(): void {
    this.http.get<ProfileView>(`${API}/admin/profile`).subscribe(p => {
      this.profile.set(p);
      this.subPhone = this.subPhone || ('0' + p.phone.slice(3));
      this.form.reset({ businessName: p.businessName, phone: p.phone, logoUrl: p.logoUrl ?? '', greetingSw: p.greetingSw ?? '',
        greetingEn: p.greetingEn ?? '', defaultLanguage: p.defaultLanguage, businessCategory: p.businessCategory ?? '' });
      QRCode.toDataURL(p.publicUrl, { margin: 1, width: 600, errorCorrectionLevel: 'M' }).then(url => this.qr.set(url));
    });
  }

  save(): void {
    this.http.put<ProfileView>(`${API}/admin/profile`, this.form.getRawValue()).subscribe({
      next: p => { this.profile.set(p); this.toast.success(this.i18n.isSw() ? 'Imehifadhiwa' : 'Saved'); },
      error: err => { const pr = toProblem(err); this.toast.error(this.i18n.error(pr.code, pr.detail)); }
    });
  }

  paySubscription(): void {
    this.paying.set(true);
    this.http.post<{ accepted: boolean; message: string }>(`${API}/admin/subscription/pay`,
      { plan: this.subPlan, provider: this.subProvider, phone: this.subPhone }).subscribe({
      next: r => {
        this.paying.set(false);
        r.accepted ? this.toast.success(this.t('track.pushSent')) : this.toast.error(r.message || this.t('track.pushFailed'));
        setTimeout(() => this.load(), 15_000);
      },
      error: err => { this.paying.set(false); const p = toProblem(err); this.toast.error(this.i18n.error(p.code, p.detail)); }
    });
  }

  waShare(p: ProfileView): string {
    const text = encodeURIComponent(`${p.businessName}: ${this.i18n.isSw() ? 'Pata namba ya foleni hapa' : 'Join our queue here'} ${p.publicUrl}`);
    return `https://wa.me/?text=${text}`;
  }

  links(p: ProfileView): { label: string; value: string; href?: string; icon: string }[] {
    const sw = this.i18n.isSw();
    return [
      { label: sw ? 'Ukurasa wa wateja' : 'Customer booking page', value: p.publicUrl, href: p.publicUrl, icon: 'qr' },
      { label: sw ? 'Skrini ya TV' : 'TV board', value: `${location.origin}/tv/${p.slug}`, href: `/tv/${p.slug}`, icon: 'tv' },
      { label: 'WhatsApp', value: this.waShare(p), href: this.waShare(p), icon: 'link' }
    ];
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.toast.success(this.i18n.isSw() ? 'Imenakiliwa' : 'Copied'),
      () => this.toast.error(this.i18n.isSw() ? 'Imeshindikana kunakili' : 'Could not copy'));
  }

  print(): void { window.print(); }
}
