import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n.service';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';

/** Split layout for sign-in / sign-up: form on the left, trust panel on the right (desktop). */
@Component({
    selector: 'fc-auth-layout',
    imports: [RouterLink, LogoComponent, LangSwitchComponent, ThemeToggleComponent, IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="grid min-h-screen bg-surface lg:grid-cols-[1fr_minmax(0,34rem)]">
      <div class="flex flex-col px-4 py-6 sm:px-8">
        <div class="flex items-center justify-between">
          <a routerLink="/" aria-label="FoleniChap"><fc-logo /></a>
          <div class="flex items-center gap-2"><fc-theme-toggle /><fc-lang-switch /></div>
        </div>
        <main class="mx-auto flex w-full flex-1 flex-col justify-center py-10" [style.max-width]="'27rem'">
          <ng-content />
        </main>
        <p class="flex items-center justify-center gap-1.5 text-xs text-ink-500">
          <fc-icon name="lock" [size]="13" />{{ L('Muunganisho salama uliosimbwa', 'Secure, encrypted connection') }}
        </p>
      </div>

      <aside class="relative hidden overflow-hidden bg-[#0b1828] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <!-- same navy + emerald glow as the landing page hero -->
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(36rem_26rem_at_100%_100%,rgba(32,154,112,.40),transparent_62%),radial-gradient(28rem_20rem_at_0%_0%,rgba(32,154,112,.12),transparent_60%)]"></div>
        <div class="relative">
          <p class="text-xs font-semibold uppercase tracking-[0.12em] text-brand-300">FoleniChap</p>
          <h2 class="mt-3 text-3xl font-bold leading-tight tracking-tight text-white">{{ L('Ondoa foleni. Lipwa haraka.', 'Eliminate waiting lines. Get paid faster.') }}</h2>
          <!-- mini "now serving" preview -->
          <div class="mt-8 max-w-xs rounded-2xl border border-white/10 bg-white/[.05] p-4" aria-hidden="true">
            <p class="text-[11px] font-bold uppercase tracking-[.14em] text-white/70">{{ L('Inahudumiwa sasa', 'Now serving') }}</p>
            <div class="mt-3 flex items-center justify-between rounded-xl bg-[#209a70] px-4 py-2.5"><span class="text-2xl font-black tabular">G-031</span><span class="text-xs text-white/85">{{ L('Dirisha A', 'Counter A') }}</span></div>
            <div class="mt-2 flex items-center justify-between rounded-xl bg-white/[.06] px-4 py-2"><span class="text-lg font-bold tabular text-white/85">G-032</span>
              <span class="rounded-full bg-[#d7f2e5] px-2 py-0.5 text-[10px] font-semibold text-[#0e513c]">{{ L('Imelipwa · M-Pesa', 'Paid · M-Pesa') }}</span></div>
          </div>
        </div>
        <ul class="relative space-y-5">
          @for (p of points; track p.icon) {
            <li class="flex gap-4">
              <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-500/15 text-brand-300"><fc-icon [name]="p.icon" [size]="20" /></span>
              <div><p class="font-semibold text-white">{{ L(p.tsw, p.ten) }}</p><p class="mt-0.5 text-sm text-white/60">{{ L(p.dsw, p.den) }}</p></div>
            </li>
          }
        </ul>
        <p class="relative text-sm text-white/50">M-Pesa · Mixx by Yas · Airtel Money · HaloPesa · AzamPesa</p>
      </aside>
    </div>
  `
})
export class AuthLayoutComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly points = [
    { icon: 'shield', tsw: 'Data yako imetengwa', ten: 'Your data is isolated', dsw: 'Hakuna biashara nyingine inayoweza kuona taarifa zako.', den: 'No other business can ever see your information.' },
    { icon: 'check-circle', tsw: 'Malipo yaliyothibitishwa', ten: 'Verified payments', dsw: 'Kila malipo yanakaguliwa kabla ya kukubaliwa.', den: 'Every payment is checked before it is accepted.' },
    { icon: 'lock', tsw: 'Kuingia kwa usalama', ten: 'Secure sign-in', dsw: 'Akaunti inafungwa kwa muda baada ya majaribio mengi yasiyo sahihi.', den: 'Accounts lock temporarily after repeated wrong passwords.' }
  ];
}
