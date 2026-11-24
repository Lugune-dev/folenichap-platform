import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toProblem } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { IconComponent } from '../../shared/icon.component';
import { PasswordFieldComponent } from '../../shared/password-field.component';
import { AuthLayoutComponent } from './auth-layout.component';

/** Only same-app paths are allowed as a post-login redirect (blocks //evil.com and /\\evil.com). */
export function safeNext(next: string | null): string | null {
  return next && /^\/(?![/\\])/.test(next) ? next : null;
}

@Component({
    selector: 'fc-login',
    imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, PasswordFieldComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <fc-auth-layout>
      <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">{{ L('Karibu tena', 'Welcome back') }}</h1>
      <p class="mt-2 text-sm text-ink-500">{{ L('Ingia kusimamia foleni na malipo ya biashara yako.', 'Sign in to manage your queue and payments.') }}</p>

      <form class="mt-8 space-y-5" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div>
          <label class="label" for="email">{{ t('auth.email') }}</label>
          <input id="email" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" placeholder="jina@biashara.co.tz"
            [attr.aria-invalid]="bad('email') || null" [attr.aria-describedby]="bad('email') ? 'email-err' : null">
          @if (bad('email')) {
            <p id="email-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka barua pepe sahihi', 'Enter a valid email') }}</p>
          }
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="label" for="pw">{{ t('auth.password') }}</label>
            <a routerLink="/forgot-password" class="mb-1.5 text-sm font-medium text-brand-700 hover:text-brand-800">{{ t('auth.forgot') }}</a>
          </div>
          <fc-password-field inputId="pw" formControlName="password" autocomplete="current-password"
            [invalid]="bad('password')" [describedBy]="bad('password') ? 'pw-err' : null"
            [showLabel]="L('Onyesha nenosiri', 'Show password')" [hideLabel]="L('Ficha nenosiri', 'Hide password')" />
          @if (bad('password')) { <p id="pw-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka nenosiri lako', 'Enter your password') }}</p> }
        </div>

        @if (error()) {
          <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div>
        }

        <button class="btn-primary btn-lg w-full" [disabled]="busy()">
          @if (busy()) { <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
          {{ busy() ? t('common.loading') : t('auth.login') }}
        </button>
      </form>

      <p class="mt-8 text-center text-sm text-ink-500">{{ t('auth.noAccount') }}
        <a routerLink="/register" class="font-semibold text-brand-700 hover:text-brand-800">{{ L('Sajili biashara bure', 'Register your business free') }}</a></p>
    </fc-auth-layout>
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required]
  });

  protected bad(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.touched && c.invalid;
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: user => this.router.navigateByUrl(safeNext(this.route.snapshot.queryParamMap.get('next')) ?? this.auth.homeFor(user.role)),
      error: err => { this.busy.set(false); const p = toProblem(err); this.error.set(this.i18n.error(p.code, p.detail)); }
    });
  }
}
