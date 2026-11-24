import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { API, toProblem } from '../../core/api';
import { I18nService } from '../../core/i18n.service';
import { ToastService } from '../../core/toast.service';
import { strongPassword } from '../../core/validators';
import { IconComponent } from '../../shared/icon.component';
import { PasswordFieldComponent } from '../../shared/password-field.component';
import { AuthLayoutComponent } from './auth-layout.component';

/** Two steps: email -> 6-digit code (sent by SMS/WhatsApp) + new password. */
@Component({
    selector: 'fc-forgot-password',
    imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, PasswordFieldComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <fc-auth-layout>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ L('Badilisha nenosiri', 'Reset your password') }}</h1>

      @if (step() === 'email') {
        <p class="mt-2 text-sm text-ink-500">{{ L('Weka barua pepe ya akaunti yako. Tutatuma namba ya uthibitisho kwenye simu iliyosajiliwa.',
          'Enter your account email. We will send a code to the phone number on your account.') }}</p>
        <form class="mt-8 space-y-5" [formGroup]="emailForm" (ngSubmit)="sendCode()" novalidate>
          <div>
            <label class="label" for="email">{{ t('auth.email') }}</label>
            <input id="email" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" placeholder="jina@biashara.co.tz">
            @if (emailForm.controls.email.touched && emailForm.controls.email.invalid) {
              <p class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka barua pepe sahihi', 'Enter a valid email') }}</p>
            }
          </div>
          @if (error()) { <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div> }
          <button class="btn-primary btn-lg w-full" [disabled]="busy()">
            @if (busy()) { <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
            {{ busy() ? t('common.loading') : L('Tuma namba', 'Send code') }}
          </button>
        </form>
      } @else {
        <div class="alert-info mt-4"><fc-icon name="phone" [size]="18" class="mt-px" />
          <span>{{ L('Ikiwa akaunti ya ' + sentTo() + ' ipo, tumetuma namba ya tarakimu 6 kwa SMS/WhatsApp. Inaisha baada ya dakika 15.',
            'If an account exists for ' + sentTo() + ', we sent a 6-digit code by SMS/WhatsApp. It expires in 15 minutes.') }}</span></div>
        <form class="mt-6 space-y-5" [formGroup]="resetForm" (ngSubmit)="reset()" novalidate>
          <div>
            <label class="label" for="code">{{ L('Namba ya uthibitisho', 'Code') }}</label>
            <input id="code" class="input h-12 text-center font-mono text-xl tracking-[0.4em]" formControlName="code" inputmode="numeric"
              autocomplete="one-time-code" maxlength="6" placeholder="••••••">
            @if (resetForm.controls.code.touched && resetForm.controls.code.invalid) {
              <p class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka tarakimu 6', 'Enter the 6 digits') }}</p>
            }
          </div>
          <div>
            <label class="label" for="npw">{{ L('Nenosiri jipya', 'New password') }}</label>
            <fc-password-field inputId="npw" formControlName="newPassword" autocomplete="new-password" [rules]="true" [sw]="i18n.isSw()"
              [showLabel]="L('Onyesha nenosiri', 'Show password')" [hideLabel]="L('Ficha nenosiri', 'Hide password')" />
          </div>
          @if (error()) { <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div> }
          <button class="btn-primary btn-lg w-full" [disabled]="busy()">
            @if (busy()) { <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
            {{ busy() ? t('common.loading') : L('Hifadhi nenosiri jipya', 'Save new password') }}
          </button>
          <div class="flex items-center justify-between text-sm">
            <button type="button" class="font-semibold text-brand-700 hover:text-brand-800 disabled:text-ink-400" [disabled]="busy()" (click)="sendCode()">{{ L('Tuma namba tena', 'Send a new code') }}</button>
            <button type="button" class="text-ink-500 hover:text-ink" (click)="step.set('email'); error.set(null)">{{ L('Badilisha barua pepe', 'Change email') }}</button>
          </div>
          <p class="text-xs text-ink-500">{{ L('Hukupata namba? Wafanyakazi wasio na namba ya simu kwenye akaunti waombe msimamizi abadilishe nenosiri.',
            'No code? Staff without a phone number on their account should ask their admin to reset the password.') }}</p>
        </form>
      }

      <p class="mt-8 text-center text-sm text-ink-500">
        <a routerLink="/login" class="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:text-brand-800"><fc-icon name="arrow-left" [size]="14" />{{ L('Rudi kuingia', 'Back to sign in') }}</a></p>
    </fc-auth-layout>
  `
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly step = signal<'email' | 'code'>('email');
  protected readonly sentTo = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly emailForm = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly resetForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    newPassword: ['', [Validators.required, strongPassword]]
  });

  sendCode(): void {
    if (this.emailForm.invalid) { this.emailForm.markAllAsTouched(); return; }
    const email = this.emailForm.getRawValue().email.trim();
    this.busy.set(true);
    this.error.set(null);
    this.http.post<void>(`${API}/auth/password/forgot`, { email }).subscribe({
      next: () => { this.busy.set(false); this.sentTo.set(email); this.step.set('code'); },
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }

  reset(): void {
    if (this.resetForm.invalid) { this.resetForm.markAllAsTouched(); return; }
    const { code, newPassword } = this.resetForm.getRawValue();
    this.busy.set(true);
    this.error.set(null);
    this.http.post<void>(`${API}/auth/password/reset`, { email: this.sentTo(), code: code.trim(), newPassword }).subscribe({
      next: () => {
        this.toast.success(this.L('Nenosiri limebadilishwa. Ingia sasa.', 'Password changed. Please sign in.'));
        this.router.navigateByUrl('/login');
      },
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }
}
