import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toProblem } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { I18nService } from '../../core/i18n.service';
import { eaMobile, strongPassword } from '../../core/validators';
import { IconComponent } from '../../shared/icon.component';
import { PasswordFieldComponent } from '../../shared/password-field.component';
import { AuthLayoutComponent } from './auth-layout.component';

/** Two short steps (business, then owner account) so the form never feels long on a phone. */
@Component({
    selector: 'fc-register',
    imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent, PasswordFieldComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <fc-auth-layout>
      @if (pending()) {
        <div class="text-center">
          <span class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><fc-icon name="check-circle" [size]="28" /></span>
          <h1 class="mt-5 text-2xl font-bold">{{ L('Usajili umepokelewa', 'Registration received') }}</h1>
          <p class="mt-2 text-ink-600">{{ t('auth.pending') }}</p>
          <a routerLink="/login" class="btn-secondary btn-lg mt-8 w-full">{{ t('auth.login') }}</a>
        </div>
      } @else {
        <span class="badge-success"><fc-icon name="sparkles" [size]="13" />{{ L('Siku 14 bure · Hakuna kadi', '14 days free · No card') }}</span>
        <h1 class="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">{{ L('Sajili biashara yako', 'Register your business') }}</h1>

        <!-- Stepper -->
        <ol class="mt-6 flex items-center gap-3 text-sm font-medium" aria-label="Progress">
          @for (s of stepLabels; track s.en; let i = $index) {
            <li class="flex items-center gap-2" [attr.aria-current]="step() === i ? 'step' : null">
              <span class="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                [class]="step() > i ? 'bg-brand-700 text-white' : step() === i ? 'bg-brand-100 text-brand-800 ring-2 ring-brand-600' : 'bg-ink-100 text-ink-500'">
                @if (step() > i) { <fc-icon name="check" [size]="14" [stroke]="2.5" /> } @else { {{ i + 1 }} }
              </span>
              <span [class.text-ink]="step() >= i" [class.text-ink-400]="step() < i">{{ L(s.sw, s.en) }}</span>
            </li>
            @if (i === 0) { <li class="h-px flex-1 bg-ink-200" aria-hidden="true"></li> }
          }
        </ol>

        <form class="mt-7 space-y-5" [formGroup]="form" (ngSubmit)="step() === 0 ? next() : submit()" novalidate>
          @if (step() === 0) {
            <div class="animate-fade-up space-y-5">
              <div>
                <label class="label" for="bn">{{ t('auth.business') }}</label>
                <input id="bn" class="input" formControlName="businessName" placeholder="Kliniki ya Afya Bora" autocomplete="organization"
                  [attr.aria-invalid]="bad('businessName') || null" [attr.aria-describedby]="bad('businessName') ? 'bn-err' : null">
                @if (bad('businessName')) { <p id="bn-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka jina la biashara', 'Enter your business name') }}</p> }
              </div>
              <div>
                <label class="label" for="cat">{{ t('auth.category') }}</label>
                <select id="cat" class="input" formControlName="businessCategory">
                  @for (c of categories; track c.v) { <option [value]="c.v">{{ L(c.sw, c.en) }}</option> }
                </select>
              </div>
              <div>
                <label class="label" for="slug">{{ t('auth.slug') }}</label>
                <div class="flex rounded-xl shadow-sm">
                  <span class="inline-flex items-center rounded-l-xl border border-r-0 border-ink-200 bg-ink-50 px-3 text-sm text-ink-500">/b/</span>
                  <input id="slug" class="input rounded-l-none shadow-none" formControlName="slug" [placeholder]="suggestedSlug() || 'afya-bora'" autocapitalize="off" spellcheck="false"
                    [attr.aria-invalid]="bad('slug') || null" aria-describedby="slug-help">
                </div>
                @if (bad('slug')) { <p id="slug-help" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Herufi ndogo, namba na vistari tu', 'Lower-case letters, numbers and dashes only') }}</p> }
                @else {
                  <p id="slug-help" class="hint">{{ L('Kiungo ambacho wateja watatumia. Kikiachwa wazi tutakitengeneza.', 'The link customers will use. Leave empty and we will create one.') }}
                    @if (linkPreview(); as lp) { <span class="mt-1 block font-medium text-ink-700">{{ lp }}</span> }</p>
                }
              </div>
              <button type="submit" class="btn-primary btn-lg w-full">{{ L('Endelea', 'Continue') }}<fc-icon name="arrow-right" [size]="18" /></button>
            </div>
          } @else {
            <div class="animate-fade-up space-y-5">
              <div class="grid gap-5 sm:grid-cols-2">
                <div>
                  <label class="label" for="on">{{ t('auth.owner') }}</label>
                  <input id="on" class="input" formControlName="ownerName" autocomplete="name"
                    [attr.aria-invalid]="bad('ownerName') || null" [attr.aria-describedby]="bad('ownerName') ? 'on-err' : null">
                  @if (bad('ownerName')) { <p id="on-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka jina lako', 'Enter your name') }}</p> }
                </div>
                <div>
                  <label class="label" for="ph">{{ t('auth.phone') }}</label>
                  <input id="ph" class="input" type="tel" formControlName="phone" inputmode="tel" placeholder="0712 345 678" autocomplete="tel"
                    [attr.aria-invalid]="bad('phone') || null" [attr.aria-describedby]="bad('phone') ? 'ph-err' : null">
                  @if (bad('phone')) { <p id="ph-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ form.controls.phone.hasError('required') ? L('Weka namba ya simu', 'Enter a phone number') : L('Namba si sahihi. Mfano: 0712 345 678', 'Invalid number. Example: 0712 345 678') }}</p> }
                </div>
              </div>
              <div>
                <label class="label" for="em">{{ t('auth.email') }}</label>
                <input id="em" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" placeholder="jina@biashara.co.tz"
                  [attr.aria-invalid]="bad('email') || null" [attr.aria-describedby]="bad('email') ? 'em-err' : null">
                @if (bad('email')) { <p id="em-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ L('Weka barua pepe sahihi', 'Enter a valid email') }}</p> }
              </div>
              <div>
                <label class="label" for="pw">{{ L('Tengeneza nenosiri', 'Create a password') }}</label>
                <fc-password-field inputId="pw" formControlName="password" autocomplete="new-password" [rules]="true" [sw]="i18n.isSw()"
                  [invalid]="bad('password')" [describedBy]="bad('password') ? 'pw-err' : null"
                  [showLabel]="L('Onyesha nenosiri', 'Show password')" [hideLabel]="L('Ficha nenosiri', 'Hide password')" />
                @if (bad('password')) { <p id="pw-err" class="field-error"><fc-icon name="alert" [size]="13" />{{ form.controls.password.hasError('required') ? L('Tengeneza nenosiri', 'Create a password') : L('Nenosiri bado halijatimiza masharti hapo juu', 'Password does not meet the rules above yet') }}</p> }
              </div>

              @if (error()) { <div class="alert-danger" role="alert"><fc-icon name="alert" [size]="18" class="mt-px" /><span>{{ error() }}</span></div> }

              <div class="flex gap-3">
                <button type="button" class="btn-secondary btn-lg" (click)="step.set(0)" [attr.aria-label]="t('common.back')"><fc-icon name="arrow-left" [size]="18" /></button>
                <button class="btn-primary btn-lg flex-1" [disabled]="busy()">
                  @if (busy()) { <span class="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span> }
                  {{ busy() ? t('common.loading') : L('Fungua akaunti', 'Create account') }}
                </button>
              </div>
              <p class="text-center text-xs text-ink-500">{{ L('Kwa kuendelea unakubali masharti ya matumizi na sera ya faragha.', 'By continuing you agree to the terms of use and privacy policy.') }}</p>
            </div>
          }
        </form>

        <p class="mt-8 text-center text-sm text-ink-500">{{ t('auth.haveAccount') }}
          <a routerLink="/login" class="font-semibold text-brand-700 hover:text-brand-800">{{ t('auth.login') }}</a></p>
      }
    </fc-auth-layout>
  `
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly busy = signal(false);
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly step = signal(0);
  protected readonly stepLabels = [{ sw: 'Biashara', en: 'Business' }, { sw: 'Akaunti yako', en: 'Your account' }];

  protected readonly categories = [
    { v: 'CLINIC', sw: 'Kliniki / Hospitali', en: 'Clinic / Hospital' }, { v: 'DENTAL', sw: 'Meno / Macho', en: 'Dental / Optical' },
    { v: 'LAB', sw: 'Maabara', en: 'Diagnostic lab' }, { v: 'SALON', sw: 'Saluni / Kinyozi', en: 'Salon / Barbershop' },
    { v: 'CARWASH', sw: 'Car wash / Gereji', en: 'Car wash / Auto service' }, { v: 'SCHOOL', sw: 'Ofisi ya shule / Bursar', en: 'School bursar office' },
    { v: 'OTHER', sw: 'Nyingine', en: 'Other' }
  ];

  protected readonly form = this.fb.nonNullable.group({
    businessName: ['', [Validators.required, Validators.maxLength(150)]],
    businessCategory: ['CLINIC'],
    slug: ['', Validators.pattern(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/)],
    ownerName: ['', Validators.required],
    phone: ['', [Validators.required, eaMobile]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, strongPassword]]
  });

  /** What the backend will generate from the business name when the slug is left empty (mirrors Slugs.slugify closely enough for a hint). */
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  protected readonly suggestedSlug = computed(() => (this.formValue().businessName ?? '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, ''));
  protected readonly linkPreview = computed(() => {
    const slug = (this.formValue().slug ?? '').trim() || this.suggestedSlug();
    return slug && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? `${location.host}/b/${slug}` : null;
  });

  protected bad(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.touched && c.invalid;
  }

  next(): void {
    const first = ['businessName', 'slug'] as const;
    first.forEach(k => this.form.controls[k].markAsTouched());
    if (first.some(k => this.form.controls[k].invalid)) return;
    this.step.set(1);
  }

  submit(): void {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    this.auth.register({ ...v, email: v.email.trim(), slug: v.slug.trim() || null, language: this.i18n.lang() }).subscribe({
      next: res => {
        if (!res.accessToken) { this.pending.set(true); return; }
        this.router.navigateByUrl('/admin/settings');
      },
      error: err => {
        this.busy.set(false);
        const p = toProblem(err);
        const fields = Object.keys(p.errors ?? {});
        const fieldMsg = p.errors ? Object.values(p.errors)[0] : null;
        this.error.set(fieldMsg ? `${fieldMsg}` : this.i18n.error(p.code, p.detail));
        if (p.code === 'INVALID_PHONE') this.form.controls.phone.setErrors({ phone: true });
        // businessName / slug live on step 1: go back there so the user can actually fix them.
        if (fields.some(f => f === 'businessName' || f === 'slug' || f === 'businessCategory')) this.step.set(0);
      }
    });
  }
}
