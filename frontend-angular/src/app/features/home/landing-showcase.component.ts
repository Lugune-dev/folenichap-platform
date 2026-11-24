import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import * as QRCode from 'qrcode';
import { RouterLink } from '@angular/router';
import { I18nService } from '../../core/i18n.service';
import { IconComponent } from '../../shared/icon.component';

/*
 * Marketing sections of the public landing page, split out of landing.component.ts to keep that file readable.
 * All device "screens" are decorative HTML (aria-hidden) and use literal hex colours so the global
 * dark-theme tint remaps in styles.css don't touch them.
 */

/** Slug of the demo business seeded by database/02_seed_demo_data.sql. Set to '' to hide demo links. */
export const DEMO_SLUG = 'afya-bora';

/**
 * Real customer quotes only. Add entries once a customer has agreed to be quoted;
 * the Testimonials section stays hidden while this list is empty.
 */
export const TESTIMONIALS: { quoteSw: string; quoteEn: string; name: string; role: string; business: string }[] = [];

abstract class Bilingual {
  protected readonly i18n = inject(I18nService);
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
}

/* ------------------------------------------------------------------ 3 feature banners */
@Component({
    selector: 'fc-feature-banners',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section id="product-tour" class="scroll-mt-20 bg-surface py-20">
      <div class="mx-auto max-w-6xl space-y-6 px-4 sm:px-6">

        <!-- 1. Instant QR booking -->
        <article id="tour-qr" class="grid scroll-mt-24 items-center gap-8 overflow-hidden rounded-3xl bg-ink-50 p-7 sm:p-10 md:grid-cols-2">
          <div>
            <p class="eyebrow">{{ L('Kujiunga kwa QR', 'QR check-in') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Kujiunga Papo Hapo kwa QR', 'Instant QR Booking') }}</h2>
            <p class="mt-3 text-lg text-ink-600">{{ L('Scan. Chagua. Lipa. Tayari. Hakuna programu ya kupakua.', 'Scan. Book. Pay. Done. Zero app required.') }}</p>
            <ul class="mt-6 space-y-2.5 text-sm text-ink-700">
              @for (b of qrPoints; track b.en) { <li class="flex gap-2.5"><fc-icon name="check-circle" [size]="18" class="text-brand-600" />{{ L(b.sw, b.en) }}</li> }
            </ul>
          </div>
          <!-- scene: QR stand on a reception desk + customer's phone ticket -->
          <div class="relative mx-auto h-72 w-full max-w-md" aria-hidden="true">
            <div class="absolute inset-x-4 bottom-6 h-3 rounded-full bg-ink-200"></div>
            <div class="absolute bottom-9 left-6 w-36 rounded-2xl border border-ink-200 bg-surface p-3 text-center shadow-lift sm:left-10">
              <p class="text-[10px] font-bold uppercase tracking-widest text-brand-700">{{ L('Scan kujiunga', 'Scan to join') }}</p>
              <div class="mt-2 aspect-square rounded-md bg-white p-2">@if (qr(); as src) { <img [src]="src" alt="" class="h-full w-full" /> }</div>
              <p class="mt-2 text-[10px] text-ink-500">Afya Bora Clinic</p>
            </div>
            <div class="absolute bottom-0 right-4 w-40 rotate-3 rounded-[1.75rem] border-[5px] border-[#1b1f23] bg-white shadow-lift sm:right-10">
              <div class="rounded-[1.4rem] bg-[#137d5a] px-3 pb-6 pt-5 text-center text-white">
                <p class="text-[10px] uppercase tracking-widest opacity-80">{{ L('Namba yako', 'Your number') }}</p>
                <p class="text-3xl font-black tabular">G-033</p>
              </div>
              <div class="-mt-3 mx-2 grid grid-cols-2 gap-1.5 rounded-xl bg-white p-2 text-center text-[#14201c] shadow">
                <div><p class="text-base font-bold">2</p><p class="text-[9px] text-[#6a7873]">{{ L('mbele yako', 'ahead') }}</p></div>
                <div><p class="text-base font-bold">~8</p><p class="text-[9px] text-[#6a7873]">{{ L('dakika', 'minutes') }}</p></div>
              </div>
              <p class="py-3 text-center text-[10px] font-semibold text-[#0f6549]">✓ {{ L('Imelipwa · TZS 15,000', 'Paid · TZS 15,000') }}</p>
            </div>
          </div>
        </article>

        <!-- 2. M-Pesa STK push -->
        <article id="tour-pay" class="grid scroll-mt-24 items-center gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#d7f2e5] via-[#b1e4cd] to-[#7ccfae] p-7 text-[#0c4333] sm:p-10 md:grid-cols-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f6549]">{{ L('Malipo ya simu', 'Mobile money') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight text-[#05261d] sm:text-4xl">{{ L('Malipo ya M-Pesa STK Push', 'M-Pesa STK Push Payments') }}</h2>
            <p class="mt-3 text-lg text-[#0e513c]">{{ L('Lipwa papo hapo: ombi la malipo linatumwa moja kwa moja kwenye simu ya mteja.', "Get paid instantly with mobile money pushed straight to the customer's phone.") }}</p>
            <ul class="mt-6 space-y-2.5 text-sm">
              @for (b of payPoints; track b.en) { <li class="flex gap-2.5"><fc-icon name="check-circle" [size]="18" class="text-[#0f6549]" />{{ L(b.sw, b.en) }}</li> }
            </ul>
          </div>
          <div class="relative mx-auto h-72 w-full max-w-md" aria-hidden="true">
            <div class="absolute right-6 top-0 h-72 w-44 rounded-[2rem] border-[6px] border-[#1b1f23] bg-[#f6f8f7] shadow-lift sm:right-12">
              <div class="mx-auto mt-2 h-1.5 w-12 rounded-full bg-[#1b1f23]"></div>
              <p class="mt-6 px-4 text-[11px] text-[#6a7873]">{{ L('Leo, 09:14', 'Today, 09:14') }}</p>
            </div>
            <!-- STK prompt floating over the phone -->
            <div class="absolute left-0 top-12 w-60 rounded-2xl bg-white p-4 text-[#14201c] shadow-lift sm:left-6">
              <p class="text-xs font-bold">M-Pesa</p>
              <p class="mt-1 text-[12px] leading-snug">{{ L('Weka PIN kulipa TZS 16,000 kwa AFYA BORA CLINIC (G-033).', 'Enter PIN to pay TZS 16,000 to AFYA BORA CLINIC (G-033).') }}</p>
              <div class="mt-3 flex gap-1.5">@for (d of [1,2,3,4]; track d) { <span class="h-2.5 w-2.5 rounded-full bg-[#14201c]"></span> }</div>
            </div>
            <div class="absolute bottom-10 left-8 flex w-64 items-center gap-3 rounded-2xl bg-white p-3 shadow-lift sm:left-14">
              <span class="flex h-9 w-9 items-center justify-center rounded-full bg-[#137d5a] text-white"><fc-icon name="check" [size]="18" [stroke]="3" /></span>
              <div class="text-[#14201c]"><p class="text-sm font-bold">{{ L('Imelipwa', 'Paid') }} · TZS 16,000</p><p class="text-[11px] text-[#6a7873]">{{ L('Imethibitishwa na AzamPay', 'Verified via AzamPay') }}</p></div>
            </div>
          </div>
        </article>

        <!-- 3. WhatsApp & SMS -->
        <article id="tour-alerts" class="grid scroll-mt-24 items-center gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#effaf5] via-[#b1e4cd] to-[#45b48b] p-7 text-[#0c4333] sm:p-10 md:grid-cols-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#0f6549]">{{ L('Taarifa', 'Notifications') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight text-[#05261d] sm:text-4xl">{{ L('Taarifa za WhatsApp & SMS', 'WhatsApp & SMS Notifications') }}</h2>
            <p class="mt-3 text-lg text-[#0e513c]">{{ L('Wajulishe wateja na punguza wasiofika kwa ujumbe wa moja kwa moja.', 'Keep customers updated and reduce no-shows with direct messaging.') }}</p>
            <ul class="mt-6 space-y-2.5 text-sm">
              @for (b of alertPoints; track b.en) { <li class="flex gap-2.5"><fc-icon name="check-circle" [size]="18" class="text-[#0f6549]" />{{ L(b.sw, b.en) }}</li> }
            </ul>
          </div>
          <div class="relative mx-auto h-72 w-full max-w-md" aria-hidden="true">
            <div class="absolute left-1/2 top-0 h-72 w-48 -translate-x-1/2 overflow-hidden rounded-[2rem] border-[6px] border-[#1b1f23] bg-[#0b141a] shadow-lift">
              <div class="flex items-center gap-2 bg-[#1f2c34] px-3 pb-2 pt-4 text-white">
                <span class="h-7 w-7 rounded-full bg-[#25d366]"></span><div><p class="text-[11px] font-semibold">FoleniChap</p><p class="text-[9px] opacity-60">{{ L('Akaunti ya biashara', 'Business account') }}</p></div>
              </div>
              <div class="space-y-2 p-3">
                @for (m of chat; track m.en) {
                  <div class="max-w-[90%] rounded-lg rounded-tl-none bg-[#202c33] px-2.5 py-1.5 text-[10.5px] leading-snug text-white/90">{{ L(m.sw, m.en) }}
                    <p class="mt-0.5 text-right text-[8px] text-white/40">{{ m.t }}</p></div>
                }
              </div>
            </div>
            <div class="absolute bottom-6 left-0 w-56 rounded-2xl bg-white/95 p-3 text-[#14201c] shadow-lift sm:left-2">
              <p class="flex items-center gap-1.5 text-[11px] font-semibold"><fc-icon name="message" [size]="14" class="text-[#0f6549]" />SMS · FOLENICHAP</p>
              <p class="mt-1 text-[11px] leading-snug text-[#4c5955]">{{ L('Zamu yako G-033 imefika. Karibu Chumba 2.', 'Your turn G-033 is now. Please go to Room 2.') }}</p>
            </div>
          </div>
        </article>
      </div>
    </section>
  `
})
export class FeatureBannersComponent extends Bilingual implements OnInit {
  /** Real QR on the reception stand: opens the demo booking page (or sign-up when there is no demo). */
  protected readonly qr = signal<string | null>(null);
  ngOnInit(): void {
    const target = location.origin + (DEMO_SLUG ? '/b/' + DEMO_SLUG : '/register');
    QRCode.toDataURL(target, { margin: 0, width: 200, color: { dark: '#14201c', light: '#ffffff' } }).then(u => this.qr.set(u)).catch(() => {});
  }
  protected readonly qrPoints = [
    { sw: 'QR moja kwa kila tawi - chapisha au tuma kwa WhatsApp', en: 'One QR per branch - print it or share it on WhatsApp' },
    { sw: 'Mteja anachagua huduma na kuona muda wa kusubiri', en: 'Customers pick a service and see the expected wait' },
    { sw: 'Wasio na simu janja wanaandikishwa na mapokezi', en: 'Reception can add walk-ins without a smartphone' }
  ];
  protected readonly payPoints = [
    { sw: 'M-Pesa, Mixx by Yas, Airtel Money, HaloPesa na AzamPesa', en: 'M-Pesa, Mixx by Yas, Airtel Money, HaloPesa & AzamPesa' },
    { sw: 'Kila malipo yanakaguliwa kiasi na chanzo', en: 'Every payment is checked for amount and source' },
    { sw: 'Tiketi inaonyesha "Imelipwa" mara moja', en: 'The ticket shows "Paid" the moment money lands' }
  ];
  protected readonly alertPoints = [
    { sw: 'Uthibitisho wa tiketi mara baada ya kujiunga', en: 'Ticket confirmation right after joining' },
    { sw: 'Arifa zamu ikikaribia na ikifika', en: 'Alerts when the turn is near and when it is called' },
    { sw: 'SMS kwa wateja wasio na WhatsApp', en: 'SMS fallback for customers without WhatsApp' }
  ];
  protected readonly chat = [
    { sw: 'Karibu Afya Bora! Tiketi yako ni G-033. Watu 5 mbele yako.', en: 'Welcome to Afya Bora! Your ticket is G-033. 5 people ahead of you.', t: '09:14' },
    { sw: 'Malipo ya TZS 16,000 yamepokelewa ✓', en: 'Payment of TZS 16,000 received ✓', t: '09:15' },
    { sw: 'Zamu yako inakaribia: watu 2 mbele yako (~8 dk).', en: 'Your turn is near: 2 people ahead (~8 min).', t: '09:31' }
  ];
}

/* ------------------------------------------------------------------ admin dashboard showcase */
@Component({
    selector: 'fc-dashboard-showcase',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    styles: [`.screen { container-type: inline-size; } .screen-inner { font-size: 1.55cqw; }`],
    template: `
    <section id="dashboard" class="scroll-mt-20 bg-surface pb-20">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="max-w-2xl">
          <p class="eyebrow">{{ L('Kwa msimamizi', 'For admins') }}</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Dashibodi ya Moja kwa Moja', 'Admin Real-Time Dashboard') }}</h2>
          <p class="mt-3 text-ink-600">{{ L('Simamia mtiririko wote kutoka kituo kimoja cha kisasa na cha haraka.', 'Manage your entire flow from one modern, fast control center.') }}</p>
        </div>

        <div class="mt-10 rounded-3xl bg-ink-50 px-3 pt-8 sm:px-10 sm:pt-12">
          <div class="screen mx-auto max-w-4xl" aria-hidden="true">
            <div class="rounded-t-2xl bg-[#111] p-2 shadow-lift sm:p-3">
              <div class="screen-inner flex overflow-hidden rounded-lg bg-white text-[#14201c]" style="aspect-ratio:16/9.4">
                <aside class="w-[17%] bg-[#0b1828] p-[1em] text-white/70">
                  <p class="flex items-center gap-[.4em] text-[.95em] font-bold text-white"><span class="h-[1.1em] w-[1.1em] rounded-[.3em] bg-[#209a70]"></span>FoleniChap</p>
                  @for (m of menu; track m; let i = $index) {
                    <p class="mt-[.8em] rounded-[.4em] px-[.6em] py-[.35em] text-[.75em]" [class]="i === 0 ? 'bg-white/10 text-white' : ''">{{ m }}</p>
                  }
                </aside>
                <div class="flex min-w-0 flex-1 flex-col p-[1.1em]">
                  <div class="flex items-center gap-[.6em]">
                    <span class="w-[45%] rounded-[.4em] bg-[#f1f4f3] px-[.7em] py-[.35em] text-[.7em] text-[#93a09b]">{{ L('Tafuta…', 'Search…') }}</span>
                    <span class="ml-auto rounded-[.4em] border border-[#dfe5e2] px-[.6em] py-[.3em] text-[.65em]">{{ L('Tawi: Kariakoo', 'Branch: Kariakoo') }}</span>
                    <span class="h-[1.6em] w-[1.6em] rounded-full bg-[#c4b5fd]"></span>
                  </div>
                  <div class="mt-[.9em] grid grid-cols-4 gap-[.7em]">
                    @for (k of kpis; track k.en) {
                      <div class="rounded-[.5em] border border-[#eef2f0] p-[.7em]">
                        <p class="text-[.65em] text-[#6a7873]">{{ L(k.sw, k.en) }}</p>
                        <p class="mt-[.2em] text-[1.35em] font-extrabold tabular">{{ k.v }}</p>
                        <p class="text-[.6em] font-semibold" [class]="k.up ? 'text-[#0f6549]' : 'text-[#b91c1c]'">{{ k.d }}</p>
                      </div>
                    }
                  </div>
                  <div class="mt-[.9em] grid flex-1 grid-cols-[1.7fr_1fr] gap-[.7em]">
                    <div class="rounded-[.5em] border border-[#eef2f0] p-[.7em]">
                      <p class="text-[.75em] font-semibold">{{ L('Wateja kwa saa', 'Customers by hour') }}</p>
                      <div class="mt-[.6em] flex h-[70%] items-end gap-[.4em]">
                        @for (h of hours; track $index) { <span class="w-full rounded-t-[.2em]" [style.height.%]="h" [class]="h > 80 ? 'bg-[#137d5a]' : 'bg-[#7ccfae]'"></span> }
                      </div>
                      <div class="mt-[.3em] flex justify-between text-[.55em] text-[#93a09b]"><span>08:00</span><span>12:00</span><span>16:00</span><span>19:00</span></div>
                    </div>
                    <div class="rounded-[.5em] border border-[#eef2f0] p-[.7em]">
                      <p class="text-[.75em] font-semibold">{{ L('Huduma maarufu', 'Top services') }}</p>
                      @for (s of services; track s.en) {
                        <div class="mt-[.6em]"><div class="flex justify-between text-[.62em]"><span>{{ L(s.sw, s.en) }}</span><b>{{ s.n }}</b></div>
                          <div class="mt-[.2em] h-[.4em] rounded-full bg-[#eef2f0]"><div class="h-full rounded-full bg-[#209a70]" [style.width.%]="s.p"></div></div></div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <ul class="mt-10 grid gap-6 sm:grid-cols-3">
          @for (c of captions; track c.en) {
            <li class="flex gap-3"><span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><fc-icon [name]="c.icon" [size]="20" /></span>
              <div><p class="font-semibold">{{ L(c.sw, c.en) }}</p><p class="mt-1 text-sm text-ink-600">{{ L(c.dsw, c.den) }}</p></div></li>
          }
        </ul>
      </div>
    </section>
  `
})
export class DashboardShowcaseComponent extends Bilingual {
  protected readonly menu = ['Dashboard', 'Appointments', 'Services', 'Staff', 'Branches', 'Payments', 'Settings'];
  protected readonly kpis = [
    { sw: 'Wateja leo', en: 'Customers today', v: '148', d: '▲ 12%', up: true },
    { sw: 'Wastani wa kusubiri', en: 'Avg. wait time', v: '7 min', d: '▼ 3 min', up: true },
    { sw: 'Mapato leo', en: 'Revenue today', v: 'TZS 1.2M', d: '▲ 18%', up: true },
    { sw: 'Wasiofika', en: 'No-shows', v: '4', d: '▲ 1', up: false }
  ];
  protected readonly hours = [30, 55, 90, 100, 75, 60, 85, 70, 45, 35, 20];
  protected readonly services = [
    { sw: 'Ushauri wa daktari', en: 'Consultation', n: 64, p: 90 }, { sw: 'Maabara', en: 'Lab tests', n: 41, p: 60 },
    { sw: 'Dawa', en: 'Pharmacy', n: 28, p: 42 }, { sw: 'Meno', en: 'Dental', n: 15, p: 24 }
  ];
  protected readonly captions = [
    { icon: 'chart', sw: 'Takwimu za moja kwa moja', en: 'Live analytics', dsw: 'Wateja, muda wa kusubiri na mapato vinasasishwa papo hapo.', den: 'Customers, wait times and revenue update in real time.' },
    { icon: 'building', sw: 'Matawi yote, akaunti moja', en: 'Every branch, one login', dsw: 'Badilisha tawi kwa kubofya mara moja.', den: 'Switch between branches in one click.' },
    { icon: 'users', sw: 'Wafanyakazi & huduma', en: 'Staff & services', dsw: 'Weka huduma, ada, madirisha na ruhusa za wafanyakazi.', den: 'Manage services, fees, counters and staff roles.' }
  ];
}

/* ------------------------------------------------------------------ industries */
@Component({
    selector: 'fc-industries',
    imports: [IconComponent, RouterLink],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section id="industries" class="scroll-mt-20 bg-surface py-20">
      <div class="mx-auto max-w-6xl px-4 sm:px-6">
        <div class="mx-auto max-w-2xl text-center">
          <p class="eyebrow">{{ L('Sekta', 'Industries') }}</p>
          <h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Imetengenezwa kwa Tanzania & Afrika Mashariki', 'Built for Tanzania & East Africa') }}</h2>
          <p class="mt-3 text-ink-600">{{ L('Mfumo mmoja, umeundwa kwa mahitaji ya kila sekta.', 'One platform, shaped around how each industry works.') }}</p>
        </div>
        <div class="mt-12 space-y-6">
          @for (s of sectors; track s.en; let odd = $odd) {
            <article [id]="s.id" class="grid scroll-mt-24 overflow-hidden rounded-3xl border border-ink-200/80 md:grid-cols-2">
              <div class="flex flex-col justify-center p-7 sm:p-10" [class]="s.panel + (odd ? ' md:order-2' : '')">
                <span class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#0f6549] shadow-card"><fc-icon [name]="s.icon" [size]="28" /></span>
                <h3 class="mt-5 text-2xl font-bold text-[#05261d]">{{ L(s.sw, s.en) }}</h3>
                <p class="mt-2 text-[#38433f]">{{ L(s.dsw, s.den) }}</p>
                <ul class="mt-5 space-y-2 text-sm text-[#25302c]">
                  @for (p of s.points; track p.en) { <li class="flex gap-2"><fc-icon name="check" [size]="17" [stroke]="2.4" class="text-[#137d5a]" />{{ L(p.sw, p.en) }}</li> }
                </ul>
              </div>
              <!-- illustrative scene: tinted backdrop, big line icon and a phone showing that sector's ticket -->
              <div class="relative min-h-[16rem] overflow-hidden" [class]="s.scene" aria-hidden="true">
                <fc-icon [name]="s.icon" size="18rem" [stroke]="0.6" class="absolute -bottom-10 -left-8 text-white/15" />
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(255,255,255,.18),transparent_60%)]"></div>
                <div class="absolute right-8 top-1/2 w-36 -translate-y-1/2 rounded-[1.6rem] border-[5px] border-[#1b1f23] bg-white shadow-lift">
                  <div class="rounded-[1.25rem] bg-[#137d5a] px-3 pb-4 pt-4 text-center text-white">
                    <p class="text-[9px] uppercase tracking-widest opacity-80">{{ s.biz }}</p>
                    <p class="text-2xl font-black tabular">{{ s.ticket }}</p>
                  </div>
                  <div class="space-y-1.5 p-3 text-[10px] text-[#14201c]">
                    <p class="flex justify-between"><span class="text-[#6a7873]">{{ L('Huduma', 'Service') }}</span><b>{{ L(s.svcSw, s.svcEn) }}</b></p>
                    <p class="flex justify-between"><span class="text-[#6a7873]">{{ L('Muda', 'Time') }}</span><b>{{ s.time }}</b></p>
                    <p class="rounded-md bg-[#d7f2e5] py-1 text-center font-semibold text-[#0e513c]">{{ L('Imelipwa', 'Paid') }} ✓</p>
                  </div>
                </div>
              </div>
            </article>
          }
        </div>
        @if (demo) {
          <p class="mt-8 text-center text-sm text-ink-600">{{ L('Unataka kuona inavyofanya kazi?', 'Want to see it in action?') }}
            <a [routerLink]="['/b', demo]" class="font-semibold text-brand-700 hover:underline dark:text-brand-300">{{ L('Fungua ukurasa wa demo', 'Open the demo booking page') }} →</a></p>
        }
      </div>
    </section>
  `
})
export class IndustriesComponent extends Bilingual {
  protected readonly demo = DEMO_SLUG;
  protected readonly sectors = [
    { id: 'industry-clinics', icon: 'stethoscope', sw: 'Kwa Kliniki', en: 'For Clinics', panel: 'bg-[#e6f6ee]', scene: 'bg-gradient-to-br from-[#45b48b] to-[#0e513c]',
      dsw: 'Wagonjwa wanawasili kwa mpangilio, madaktari wanajua nani anafuata, na ada ya ushauri inalipwa kabla.',
      den: 'Patients arrive in an orderly flow, doctors know who is next, and consultation fees are paid upfront.',
      biz: 'Afya Bora', ticket: 'D-014', svcSw: 'Ushauri', svcEn: 'Consultation', time: '09:30',
      points: [{ sw: 'Foleni tofauti kwa kila chumba au daktari', en: 'Separate queues per room or doctor' }, { sw: 'Miadi na wanaofika bila miadi pamoja', en: 'Appointments and walk-ins in one queue' }] },
    { id: 'industry-salons', icon: 'scissors', sw: 'Kwa Saluni', en: 'For Salons', panel: 'bg-[#f4ede4]', scene: 'bg-gradient-to-br from-[#b08968] to-[#4a3426]',
      dsw: 'Pokea amana ya booking kwa simu, panga wasusi wako, na dhibiti saa za msongamano bila kelele.',
      den: 'Take booking deposits by mobile money, schedule your stylists and handle peak hours calmly.',
      biz: 'Glamour Saluni', ticket: 'S-021', svcSw: 'Kusuka', svcEn: 'Braiding', time: '11:00',
      points: [{ sw: 'Amana ya booking kupunguza wasiofika', en: 'Booking deposits to cut no-shows' }, { sw: 'Mteja anachagua msusi', en: 'Customers choose their stylist' }] },
    { id: 'industry-carwash', icon: 'car', sw: 'Kwa Car Wash', en: 'For Car Wash', panel: 'bg-[#eceff1]', scene: 'bg-gradient-to-br from-[#4b5563] to-[#111827]',
      dsw: 'Weka muda maalum wa kuosha, wateja wanasubiri popote, na wanaarifiwa gari likiwa tayari.',
      den: 'Book specific wash slots, let drivers wait anywhere and notify them when the car is ready.',
      biz: 'Shine Car Wash', ticket: 'C-007', svcSw: 'Kuosha kamili', svcEn: 'Full wash', time: '14:15',
      points: [{ sw: 'Arifa ya WhatsApp gari likiwa tayari', en: 'WhatsApp alert when the car is ready' }, { sw: 'Huduma na bei tofauti kwa aina ya gari', en: 'Services and prices per vehicle type' }] }
  ];
}

/* ------------------------------------------------------------------ testimonials (hidden until real quotes exist) */
@Component({
    selector: 'fc-testimonials',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (items.length) {
      <section id="testimonials" class="scroll-mt-20 bg-surface py-20">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 class="text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Wateja wetu wanasema', 'What our customers say') }}</h2>
          <div class="mt-10 flex snap-x gap-5 overflow-x-auto pb-4">
            @for (t of items; track t.name) {
              <figure class="card w-80 shrink-0 snap-start p-6">
                <fc-icon name="quote" [size]="22" class="text-brand-600" />
                <blockquote class="mt-3 text-sm leading-relaxed text-ink-700">{{ L(t.quoteSw, t.quoteEn) }}</blockquote>
                <figcaption class="mt-5 flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800">{{ t.name.charAt(0) }}</span>
                  <span><b class="block text-sm">{{ t.name }}</b><span class="text-xs text-ink-500">{{ t.role }}, {{ t.business }}</span></span>
                </figcaption>
              </figure>
            }
          </div>
        </div>
      </section>
    }
  `
})
export class TestimonialsComponent extends Bilingual {
  protected readonly items = TESTIMONIALS;
}
