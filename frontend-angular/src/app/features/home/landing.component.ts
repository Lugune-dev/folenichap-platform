import { ChangeDetectionStrategy, Component, OnInit, afterNextRender, inject, signal } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';
import { I18nService } from '../../core/i18n.service';
import { IconComponent } from '../../shared/icon.component';
import { LangSwitchComponent } from '../../shared/lang-switch.component';
import { ThemeToggleComponent } from '../../shared/theme-toggle.component';
import { LogoComponent } from '../../shared/logo.component';
import { DEMO_SLUG, DashboardShowcaseComponent, FeatureBannersComponent, IndustriesComponent, TestimonialsComponent } from './landing-showcase.component';

/** A comparison-table cell: included / not included / a short bilingual value. */
type Cell = boolean | { sw: string; en: string };
const txt = (sw: string, en = sw) => ({ sw, en });
const UNLIMITED = txt('Bila kikomo', 'Unlimited');

/**
 * Public contact details. TODO: fill in the real phone / WhatsApp number and social profiles -
 * empty values are simply not shown on the page.
 */
const CONTACT = {
  email: 'sales@folenichap.co.tz',
  phone: '',          // e.g. '+255 7xx xxx xxx'
  whatsapp: '',       // international digits only, e.g. '2557xxxxxxxx'
  city: 'Dar es Salaam, Tanzania',
  instagram: '',      // full profile URLs
  linkedin: '',
  x: ''
};

@Component({
    selector: 'fc-landing',
    imports: [RouterLink, FormsModule, LangSwitchComponent, ThemeToggleComponent, LogoComponent, IconComponent,
        FeatureBannersComponent, DashboardShowcaseComponent, IndustriesComponent, TestimonialsComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { '(click)': 'onAnchorClick($event)' },
    styles: [`
    :host { display: block; }
    .hero-bg {
      background:
        radial-gradient(46rem 30rem at 92% 62%, rgba(32,154,112,.42), transparent 62%),
        radial-gradient(36rem 22rem at 0% 0%, rgba(32,154,112,.10), transparent 60%),
        linear-gradient(180deg, #0b1828 0%, #0a1622 100%);
    }
    /* light diagonal that cuts the bottom of the hero */
    .hero-cut { clip-path: polygon(0 66%, 100% 22%, 100% 100%, 0 100%); }

    /* Device stage: everything inside is sized in em off a container-relative font size,
       so the whole composition scales as one picture from phone width up to desktop. */
    .stage { container-type: inline-size; }
    .stage-inner { position: relative; aspect-ratio: 16 / 8; font-size: 1.6cqw; }
    @media (max-width: 639px) { .stage-inner { aspect-ratio: 16 / 10.5; font-size: 1.75cqw; } }

    .dev { position: absolute; }
    .laptop { left: 30%; top: 4%; width: 50%; }
    .laptop-screen { border-radius: .9em .9em 0 0; background: #111; padding: .5em; box-shadow: 0 2em 4em -1em rgba(0,0,0,.45); }
    .laptop-base { height: 1.1em; margin: 0 -6%; border-radius: 0 0 1.2em 1.2em; background: linear-gradient(#d4d8dc, #8f979e); }
    .tv { right: 4%; top: -6%; width: 18%; }
    /* on wide screens the TV board climbs up beside the headline, as in the design */
    @media (min-width: 1024px) { .tv { top: -52%; } .clock-big { top: -64% !important; } }
    .phone { border-radius: 2em; border: .35em solid #1b1f23; background: #1b1f23; box-shadow: 0 2em 3.5em -1em rgba(0,0,0,.5); overflow: hidden; }
    .phone-qr { left: 9%; top: 18%; width: 14.5%; aspect-ratio: 9 / 18.5; transform: rotate(-10deg); }
    .phone-pay { left: 21%; top: 30%; width: 14.5%; aspect-ratio: 9 / 18.5; }
    .deco { position: absolute; color: rgba(69,180,139,.55); }
    .wave span { display: inline-block; width: .18em; margin: 0 .09em; border-radius: 1em; background: currentColor; }
    .float { animation: floaty 6s ease-in-out infinite; }
    .float-2 { animation: floaty 7s ease-in-out -2s infinite; }
    @keyframes floaty { 0%,100% { translate: 0 0; } 50% { translate: 0 -.5em; } }
  `],
    template: `
    <!-- ============ Header ============ -->
    <header class="sticky top-0 z-40 border-b border-white/5 bg-[#0b1828]/90 text-white backdrop-blur-md">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a routerLink="/" aria-label="FoleniChap"><fc-logo [light]="true" /></a>
        <nav class="hidden items-center gap-8 text-sm font-medium text-white/75 md:flex" [attr.aria-label]="L('Menyu kuu', 'Main')">
          <a href="#product-tour" class="transition hover:text-white">{{ L('Bidhaa', 'Products') }}</a>
          <!-- Features dropdown: opens on hover and on keyboard focus -->
          <div class="group relative">
            <button type="button" class="flex items-center gap-1 transition hover:text-white group-focus-within:text-white" aria-haspopup="true">
              {{ L('Vipengele', 'Features') }}<fc-icon name="chevron-down" [size]="15" class="transition group-hover:rotate-180" />
            </button>
            <div class="invisible absolute left-1/2 top-full w-72 -translate-x-1/2 pt-3 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div class="rounded-2xl border border-ink-200 bg-surface p-2 text-ink shadow-lift">
                @for (f of featureMenu; track f.href) {
                  <a [href]="f.href" class="flex items-start gap-3 rounded-xl p-3 hover:bg-ink-50">
                    <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><fc-icon [name]="f.icon" [size]="17" /></span>
                    <span><span class="block text-sm font-semibold">{{ L(f.sw, f.en) }}</span><span class="block text-xs text-ink-500">{{ L(f.dsw, f.den) }}</span></span>
                  </a>
                }
              </div>
            </div>
          </div>
          <a href="#pricing" class="transition hover:text-white">{{ L('Bei', 'Pricing') }}</a>
          <a href="#contact" class="transition hover:text-white">{{ L('Mawasiliano', 'Contacts') }}</a>
        </nav>
        <div class="flex items-center gap-2">
          <span class="hidden items-center gap-2 lg:flex"><fc-theme-toggle [onDark]="true" /><fc-lang-switch [onDark]="true" /></span>
          <a routerLink="/login" class="btn hidden text-white/85 hover:bg-white/10 hover:text-white sm:inline-flex">{{ t('auth.login') }}</a>
          <a routerLink="/register" class="btn bg-brand-500 text-white shadow-sm hover:bg-brand-400">{{ L('Anza sasa', 'Get started') }}</a>
          <button type="button" class="btn-icon text-white hover:bg-white/10 hover:text-white md:hidden" (click)="menu.set(!menu())"
                  [attr.aria-expanded]="menu()" aria-controls="mobile-nav" [attr.aria-label]="L('Menyu', 'Menu')">
            <fc-icon [name]="menu() ? 'x' : 'menu'" [size]="20" />
          </button>
        </div>
      </div>
      @if (menu()) {
        <nav id="mobile-nav" class="animate-slide-in border-t border-white/10 px-4 pb-4 pt-2 md:hidden">
          @for (n of mobileNav; track n.href) {
            <a [href]="n.href" class="block rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10">{{ L(n.sw, n.en) }}</a>
          }
          <div class="mt-2 flex items-center gap-2 border-t border-white/10 px-3 pt-3"><fc-theme-toggle [onDark]="true" /><fc-lang-switch [onDark]="true" />
            <a routerLink="/login" class="ml-auto text-sm font-medium text-white/80">{{ t('auth.login') }}</a></div>
        </nav>
      }
    </header>

    <main>
      <!-- ============ Hero ============ -->
      <section id="products" class="hero-bg relative scroll-mt-16 overflow-hidden text-white">
        <div class="relative mx-auto max-w-6xl px-4 pt-14 sm:px-6 md:pt-20">
          <div class="max-w-3xl animate-fade-up">
            <h1 class="text-[2.6rem] font-extrabold leading-[1.06] tracking-tight text-white sm:text-6xl">
              {{ L('Ondoa Foleni.', 'Eliminate Waiting Lines.') }}<br>{{ L('Lipwa Haraka.', 'Get Paid Faster.') }}
            </h1>
            <p class="mt-5 max-w-lg text-lg leading-relaxed text-white/80">
              {{ L('Mfumo wa foleni janja na malipo ya simu kwa kliniki na saluni Tanzania na Afrika Mashariki.',
                   'The Smart Queue & Mobile Money Booking Solution for Clinics & Salons in Tanzania & East Africa.') }}
            </p>
            <a routerLink="/register" class="btn btn-lg mt-8 bg-brand-500 text-white shadow-lift hover:bg-brand-400">{{ L('Jaribu Siku 14 Bure', 'Start 14-Day Free Trial') }}</a>
          </div>
        </div>

        <!-- Product composition (decorative) -->
        <div class="relative mt-10 sm:mt-4">
          <div class="hero-cut absolute inset-x-0 -bottom-px top-0 bg-ink-50"></div>
          <div class="stage relative mx-auto max-w-6xl px-2 sm:px-6" aria-hidden="true">
            <div class="stage-inner">

              <!-- floating decorations: currency badges, clocks, sound waves -->
              <span class="deco float flex h-[3.2em] w-[3.2em] items-center justify-center rounded-full border-[.15em] border-current text-[1em] font-bold" style="left:51%;top:-14%">TZS</span>
              <span class="deco float-2 flex h-[2.4em] w-[2.4em] items-center justify-center rounded-full border-[.12em] border-white/25 text-[1em] text-white/40" style="left:24%;top:-2%">$</span>
              <span class="deco clock-big text-white/35" style="right:-1%;top:-14%"><fc-icon name="clock" size="4.5em" [stroke]="1.2" /></span>
              <span class="deco text-[#9aa7b3]/70" style="right:1%;top:62%"><fc-icon name="clock" size="2.6em" [stroke]="1.3" /></span>
              <span class="deco wave flex h-[2.4em] items-center" style="left:3%;top:40%">
                @for (h of wave; track $index) { <span [style.height.em]="h"></span> }
              </span>
              <span class="deco wave flex h-[2em] items-center" style="left:69%;top:-12%">
                @for (h of wave.slice(0, 5); track $index) { <span [style.height.em]="h * .8"></span> }
              </span>

              <!-- Laptop: reception dashboard. Mock screens use literal hex colours so the global dark-theme tint remaps don't apply. -->
              <div class="dev laptop">
                <div class="laptop-screen">
                  <div class="flex overflow-hidden rounded-[.4em] bg-white text-[#14201c]" style="aspect-ratio:16/10">
                    <aside class="w-[17%] border-r border-[#eef2f0] bg-[#f6f8f7] p-[.6em]">
                      <p class="flex items-center gap-[.3em] text-[.62em] font-bold"><span class="h-[1em] w-[1em] rounded-[.25em] bg-[#0f6549]"></span>FoleniChap</p>
                      @for (m of sideMenu; track m; let i = $index) {
                        <p class="mt-[.55em] rounded-[.3em] px-[.4em] py-[.25em] text-[.45em]" [class]="i === 0 ? 'bg-[#d7f2e5] font-semibold text-[#0e513c]' : 'text-[#4c5955]'">{{ m }}</p>
                      }
                    </aside>
                    <div class="flex min-w-0 flex-1 flex-col">
                      <!-- top bar -->
                      <div class="flex items-center gap-[.5em] border-b border-[#eef2f0] px-[.7em] py-[.35em]">
                        <span class="w-[40%] rounded-[.3em] bg-[#f1f4f3] px-[.5em] py-[.2em] text-[.4em] text-[#93a09b]">{{ L('Tafuta tiketi, mteja…', 'Search tickets, customers…') }}</span>
                        <span class="ml-auto h-[1.1em] w-[1.1em] rounded-full bg-[#c4b5fd]"></span>
                        <span class="text-[.42em] font-semibold">Admin</span>
                      </div>
                      <div class="grid flex-1 grid-cols-[1.9fr_1fr] gap-[.5em] p-[.6em]">
                        <div class="min-w-0">
                          <div class="flex items-center justify-between">
                            <p class="text-[.78em] font-bold">{{ L('Foleni ya Mapokezi', 'Reception Queue') }}</p>
                            <span class="rounded-[.3em] bg-[#0f6549] px-[.6em] py-[.25em] text-[.4em] font-semibold text-white">{{ L('Ita anayefuata', 'Call next') }}</span>
                          </div>
                          <div class="mt-[.45em] grid grid-cols-2 gap-[.45em]">
                            <div class="rounded-[.4em] border border-[#eef2f0] p-[.45em]"><p class="text-[.42em] font-semibold">{{ L('Takwimu za moja kwa moja', 'Real-time analytics') }}</p>
                              <div class="flex items-end justify-between"><p class="text-[.95em] font-extrabold">22,888</p>
                                <div class="flex h-[1.3em] w-[45%] items-end gap-[.12em]">@for (b of bars; track $index) {<span class="w-full rounded-[.1em] bg-[#209a70]" [style.height.%]="b"></span>}</div></div></div>
                            <div class="rounded-[.4em] border border-[#eef2f0] p-[.45em]"><p class="text-[.42em] font-semibold">{{ L('Waliohudumiwa leo', 'Served today') }}</p>
                              <div class="flex items-end justify-between"><p class="text-[.95em] font-extrabold">180</p>
                                <svg viewBox="0 0 60 18" class="h-[1.3em] w-[45%]"><path d="M0 14 L10 11 L20 12 L30 7 L40 9 L50 3 L60 5" fill="none" stroke="#209a70" stroke-width="1.8"/></svg></div></div>
                          </div>
                          <div class="mt-[.45em] rounded-[.4em] border border-[#eef2f0]">
                            <p class="border-b border-[#eef2f0] px-[.5em] py-[.3em] text-[.45em] font-semibold">{{ L('Foleni ya mapokezi', 'Reception queue') }}</p>
                            @for (r of queueRows; track r.no) {
                              <div class="flex items-center gap-[.5em] border-b border-[#eef2f0] px-[.5em] py-[.28em] text-[.42em] last:border-0">
                                <span class="h-[1.5em] w-[1.5em] shrink-0 rounded-full" [style.background]="r.c"></span>
                                <span class="w-[24%] truncate font-semibold">{{ r.name }}</span>
                                <span class="w-[14%] font-bold tabular">{{ r.no }}</span>
                                <span class="rounded-full px-[.6em] py-[.1em] font-semibold" [class]="r.cls">{{ L(r.sw, r.en) }}</span>
                                <span class="ml-auto text-[#93a09b]">{{ r.t }}</span>
                              </div>
                            }
                          </div>
                        </div>
                        <!-- right column: customer profile -->
                        <div class="min-w-0 space-y-[.45em]">
                          <div class="rounded-[.4em] border border-[#eef2f0] p-[.45em]">
                            <p class="text-[.45em] font-semibold">{{ L('Wasifu wa mteja', 'Customer profile') }}</p>
                            <div class="mt-[.35em] flex items-center gap-[.35em]"><span class="h-[1.7em] w-[1.7em] rounded-full bg-[#fcd34d]"></span>
                              <span class="text-[.42em] leading-tight"><b>Asha Kimaro</b><br><span class="text-[#93a09b]">G-033 · {{ L('Ushauri', 'Consultation') }}</span></span></div>
                            <div class="mt-[.35em] flex justify-between text-[.42em]"><span class="text-[#93a09b]">{{ L('Kiasi', 'Amount') }}</span><b>TZS 16,000</b></div>
                            <span class="mt-[.4em] block rounded-[.3em] bg-[#0f6549] py-[.3em] text-center text-[.4em] font-semibold text-white">{{ L('Imelipwa · M-Pesa', 'Paid · M-Pesa') }}</span>
                          </div>
                          <div class="rounded-[.4em] border border-[#eef2f0] p-[.45em]">
                            <p class="text-[.45em] font-semibold">{{ L('Malipo ya karibuni', 'Recent payments') }}</p>
                            @for (p of payments; track p.n) {
                              <div class="mt-[.35em] flex items-center gap-[.3em] text-[.4em]"><span class="h-[1.4em] w-[1.4em] rounded-full" [style.background]="p.c"></span>
                                <span class="truncate">{{ p.n }}</span><span class="ml-auto font-semibold text-[#0f6549]">+{{ p.a }}</span></div>
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="laptop-base"></div>
              </div>

              <!-- TV board -->
              <div class="dev tv float-2">
                <div class="rounded-[.6em] border-[.3em] border-[#2a3238] bg-[#121a20] p-[.6em] shadow-[0_2em_4em_-1em_rgba(0,0,0,.6)]">
                  <p class="pb-[.2em] text-center text-[.7em] font-bold uppercase tracking-[.12em] text-white">{{ t('tv.nowServing') }}</p>
                  @for (s of tvRows; track s.no; let i = $index) {
                    <div class="mt-[.4em] flex items-center justify-between rounded-[.35em] px-[.55em] py-[.35em]"
                         [class]="i === 0 ? 'bg-[#209a70] text-white' : 'bg-[#1f2a31] text-white/90'">
                      <span class="text-[1.15em] font-black tabular">{{ s.no }}</span>
                      <span class="text-right text-[.45em] leading-tight opacity-80">{{ L(s.sw, s.en) }} {{ s.at }}<br><b class="text-[1.25em]">{{ s.time }}</b></span>
                    </div>
                  }
                  <p class="mt-[.5em] text-center text-[.45em] text-white/50">{{ L('Karibu · Tafadhali subiri namba yako', 'Welcome · Please wait for your number') }}</p>
                </div>
              </div>

              <!-- Phone: QR check-in -->
              <div class="dev phone phone-qr float">
                <div class="flex h-full flex-col items-center rounded-[1.6em] bg-gradient-to-b from-[#3a4347] to-[#161b1e] px-[.8em] pt-[2.2em] text-white">
                  <p class="text-[.85em] font-bold">FoleniChap</p>
                  <div class="relative mt-[1em] w-full rounded-[.6em] bg-white p-[.5em]">
                    @if (qr(); as src) { <img [src]="src" alt="" class="block aspect-square w-full" /> } @else { <div class="aspect-square w-full"></div> }
                    <span class="absolute -inset-[.3em] rounded-[.8em] border-[.15em] border-[#45b48b]"></span>
                  </div>
                  <p class="mt-[1em] text-[.55em] text-white/70">{{ L('Scan kujiunga', 'Scan to join') }}</p>
                </div>
              </div>

              <!-- Phone: mobile money paid -->
              <div class="dev phone phone-pay float-2">
                <div class="flex h-full flex-col rounded-[1.6em] bg-white text-[#14201c]">
                  <div class="flex flex-col items-center bg-[#137d5a] px-[.6em] pb-[1.4em] pt-[1.8em] text-white">
                    <p class="text-[.9em] font-black tracking-tight">M-PESA</p>
                    <span class="mt-[.5em] flex h-[2em] w-[2em] items-center justify-center rounded-full bg-white text-[#137d5a]"><fc-icon name="check" size="1.2em" [stroke]="3" /></span>
                  </div>
                  <div class="mx-[.5em] -mt-[.8em] rounded-[.5em] bg-white p-[.5em] text-center shadow-[0_.3em_1em_rgba(0,0,0,.12)]">
                    <p class="text-[.42em] text-[#6a7873]">{{ L('Malipo yamethibitishwa', 'Payment confirmed') }}</p>
                    <p class="whitespace-nowrap text-[.62em] font-extrabold text-[#0f6549]">{{ L('IMELIPWA', 'PAID') }} · TZS 16,000</p>
                  </div>
                  <div class="space-y-[.4em] px-[.7em] pt-[.7em] text-[.45em]">
                    <p class="flex justify-between"><span class="text-[#6a7873]">{{ L('Tiketi', 'Ticket') }}</span><b>G-033</b></p>
                    <p class="flex justify-between"><span class="text-[#6a7873]">{{ L('Kiasi', 'Amount') }}</span><b>TZS 16,000</b></p>
                    <p class="flex justify-between"><span class="text-[#6a7873]">{{ L('Mbele yako', 'Ahead of you') }}</span><b>2</b></p>
                  </div>
                  <span class="mx-[.7em] mb-[.9em] mt-auto rounded-[.4em] bg-[#137d5a] py-[.4em] text-center text-[.5em] font-semibold text-white">{{ L('Fuatilia zamu', 'Track my turn') }}</span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      <!-- ============ Feature highlights (overlap the diagonal) ============ -->
      <section id="features" class="relative z-10 scroll-mt-20 bg-ink-50 pb-16">
        <div class="mx-auto mt-2 grid max-w-6xl gap-5 px-4 sm:-mt-16 sm:px-6 md:grid-cols-3">
          <!-- QR check-in -->
          <article id="feature-qr" class="card scroll-mt-24 p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
            <div class="flex h-20 items-center">
              <span class="relative block h-16 w-16 p-2 text-ink-900">
                @for (c of corners; track c) { <span class="absolute h-4 w-4 border-brand-600" [class]="c"></span> }
                @if (qr(); as src) { <img [src]="src" alt="" class="h-full w-full dark:invert" /> }
              </span>
            </div>
            <h3 class="mt-3 text-lg font-semibold">{{ L('Kujiunga kwa QR Haraka', 'Fast QR Check-In') }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-ink-600">{{ L('Mteja anascan QR mlangoni na kupata namba kwenye simu yake. Hakuna programu wala printa.', 'Customers scan a QR code at the door and get their number on their phone. No app, no printer.') }}</p>
          </article>
          <!-- Mobile money -->
          <article id="feature-pay" class="card scroll-mt-24 p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
            <div class="relative flex h-20 items-center">
              <span class="relative flex h-16 w-10 items-end justify-center rounded-lg border-2 border-ink-800 pb-1.5"><span class="h-0.5 w-3 rounded bg-ink-800"></span></span>
              <span class="-ml-3 rounded-md bg-surface px-1 text-base font-black tracking-tight"><span class="text-brand-600">M-</span><span class="text-rose-600">PESA</span></span>
              <span class="absolute right-10 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white ring-2 ring-surface">TZS</span>
              <span class="absolute right-2 top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink-800 bg-surface text-sm font-bold">$</span>
              <span class="absolute right-5 top-10 flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink-800 bg-surface text-sm font-bold">€</span>
            </div>
            <h3 class="mt-3 text-lg font-semibold">{{ L('Malipo ya M-Pesa & Mixx (STK Push)', 'M-Pesa & Mixx STK Push Payments') }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-ink-600">{{ L('Kusanya ada kabla ya zamu. Mteja anaweka PIN tu, na malipo yanathibitishwa papo hapo.', 'Collect the booking fee before the turn. The customer just enters their PIN and the payment is verified instantly.') }}</p>
          </article>
          <!-- WhatsApp alerts -->
          <article id="feature-alerts" class="card scroll-mt-24 p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
            <div class="flex h-20 items-center">
              <span class="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#25d366] text-white shadow-md">
                <svg viewBox="0 0 24 24" class="h-9 w-9" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 8.6c0 3.3 3 6.4 6.4 6.4l1.1-1.6-1.9-1-1 .8c-1-.4-2.2-1.6-2.6-2.6l.8-1-1-1.9z" fill="currentColor" stroke-width="1"/>
                </svg>
              </span>
            </div>
            <h3 class="mt-3 text-lg font-semibold">{{ L('Taarifa za WhatsApp & Hali ya Zamu', 'WhatsApp Alerts & Status Updates') }}</h3>
            <p class="mt-2 text-sm leading-relaxed text-ink-600">{{ L('Mteja anaarifiwa kwa WhatsApp au SMS zamu yake ikikaribia, hivyo anasubiri popote.', 'Customers get a WhatsApp or SMS alert as their turn approaches, so they can wait anywhere.') }}</p>
          </article>
        </div>

        <div class="mx-auto mt-12 flex max-w-6xl flex-col items-center gap-4 px-4 sm:flex-row sm:justify-between sm:px-6">
          <p class="text-sm font-medium text-ink-500">{{ L('Pokea malipo kutoka mitandao yote mikuu', 'Accept payments from every major network') }}</p>
          <ul class="flex flex-wrap items-center justify-center gap-2.5">
            @for (n of networks; track n) { <li class="rounded-full border border-ink-200 bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink-700 shadow-sm">{{ n }}</li> }
          </ul>
        </div>
      </section>

      <!-- ============ Product tour + admin dashboard ============ -->
      <fc-feature-banners />
      <fc-dashboard-showcase />

      <!-- ============ How it works ============ -->
      <section id="how" class="scroll-mt-20 bg-surface py-20">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <div class="mx-auto max-w-2xl text-center">
            <p class="eyebrow">{{ L('Hatua 3 tu', 'Just 3 steps') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Kutoka kusajili hadi foleni ya kwanza kwa dakika 10', 'From sign-up to your first queue in 10 minutes') }}</h2>
          </div>
          <ol class="mt-12 grid gap-6 md:grid-cols-3">
            @for (s of steps; track s.icon; let i = $index) {
              <li class="relative rounded-2xl border border-ink-200/80 bg-ink-50 p-6">
                <span class="absolute right-5 top-4 text-5xl font-black text-ink-200 tabular">{{ i + 1 }}</span>
                <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-700 text-white"><fc-icon [name]="s.icon" [size]="22" /></span>
                <h3 class="mt-5 text-lg font-semibold">{{ L(s.tsw, s.ten) }}</h3>
                <p class="mt-2 text-sm leading-relaxed text-ink-600">{{ L(s.dsw, s.den) }}</p>
              </li>
            }
          </ol>
        </div>
      </section>

      <!-- ============ Trust & security ============ -->
      <section id="security" class="scroll-mt-16 bg-[#0b1828] py-20 text-white">
        <div class="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500/15 text-brand-300"><fc-icon name="shield" [size]="26" /></span>
            <h2 class="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{{ L('Data na pesa zako ziko salama', 'Your data and your money are protected') }}</h2>
            <p class="mt-4 text-white/65">{{ L('Tumeijenga FoleniChap kwa viwango vya usalama vya mifumo ya kifedha.', 'FoleniChap is built to the security standards of financial systems.') }}</p>
          </div>
          <ul class="grid gap-4 sm:grid-cols-2">
            @for (s of security; track s.icon) {
              <li class="rounded-2xl border border-white/10 bg-white/[.04] p-5">
                <fc-icon [name]="s.icon" [size]="20" class="text-brand-300" />
                <p class="mt-3 font-semibold text-white">{{ L(s.tsw, s.ten) }}</p>
                <p class="mt-1 text-sm text-white/60">{{ L(s.dsw, s.den) }}</p>
              </li>
            }
          </ul>
        </div>
      </section>

      <!-- ============ Industries ============ -->
      <fc-industries />

      <!-- ============ Pricing comparison ============ -->
      <section id="pricing" class="scroll-mt-20 bg-ink-50 py-20">
        <div class="mx-auto max-w-6xl px-4 sm:px-6">
          <!-- md+: comparison table -->
          <div class="hidden md:block">
            <div class="grid grid-cols-[1.5fr_repeat(3,1fr)] gap-x-3">
              <!-- header row -->
              <div class="flex flex-col justify-center pb-6 pr-4">
                <p class="eyebrow">{{ L('Bei za kisasa', 'Modern pricing') }}</p>
                <h2 class="mt-2 text-3xl font-bold leading-tight tracking-tight lg:text-[2.6rem]">{{ L('Linganisha Bei', 'Pricing Comparison') }}</h2>
                <p class="mt-3 text-sm text-ink-500">{{ L('Siku 14 bure na vipengele vyote vya Pro. Hakuna kadi.', '14 days free with every Pro feature. No card needed.') }}</p>
              </div>
              @for (p of plans; track p.name) {
                <div class="relative flex flex-col items-center rounded-t-2xl border border-b-0 px-4 pb-6 pt-8 text-center"
                     [class]="p.featured ? 'border-2 border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-ink-200 bg-surface'">
                  @if (p.featured) { <span class="badge-success absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap bg-surface">{{ L('Maarufu zaidi', 'Most popular') }}</span> }
                  <h3 class="text-xl font-semibold">{{ p.name }}</h3>
                  <p class="mt-2 text-[1.7rem] font-extrabold tracking-tight tabular">{{ p.price ? 'TZS ' + p.price : L('Maalum', 'Custom') }}</p>
                  <p class="text-xs text-ink-500">{{ p.price ? L('kwa mwezi', 'per month') : L('kwa mashirika makubwa', 'for larger organisations') }}</p>
                  @if (p.price) {
                    <a routerLink="/register" class="mt-5 w-full" [class]="p.featured ? 'btn bg-brand-600 text-white hover:bg-brand-500' : 'btn bg-[#0b1828] text-white hover:bg-[#16283b] dark:bg-white dark:text-[#0b1828]'">{{ L('Anza sasa', 'Buy now') }}</a>
                  } @else {
                    <a [href]="mailto('FoleniChap Enterprise')" class="btn mt-5 w-full bg-[#0b1828] text-white hover:bg-[#16283b] dark:bg-white dark:text-[#0b1828]">{{ L('Wasiliana nasi', 'Contact sales') }}</a>
                  }
                </div>
              }

              <!-- "Features" heading row -->
              <div class="border-t border-ink-200 pb-2 pt-5 text-lg font-semibold">{{ L('Vipengele', 'Features') }}</div>
              @for (p of plans; track p.name) { <div class="border-x" [class]="p.featured ? 'border-x-2 border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-ink-200 bg-surface'"></div> }

              <!-- feature rows -->
              @for (row of matrix; track row.en; let last = $last) {
                <div class="flex items-center gap-2.5 py-3 text-sm text-ink-700">
                  <fc-icon name="check-circle" [size]="18" class="text-brand-600" />{{ L(row.sw, row.en) }}
                </div>
                @for (c of row.cells; track $index; let j = $index) {
                  <div class="flex items-center justify-center px-3 py-3 text-center text-sm"
                       [class]="(plans[j].featured ? 'border-x-2 border-brand-500 bg-brand-50 dark:bg-brand-500/10' : 'border-x border-ink-200 bg-surface')
                                + (last ? (plans[j].featured ? ' rounded-b-2xl border-b-2 pb-5' : ' rounded-b-2xl border-b pb-5') : '')">
                    @if (c === true) { <fc-icon name="check-circle" [size]="20" class="text-brand-600" [label]="L('Kimo', 'Included')" /> }
                    @else if (c === false) { <span class="text-ink-300" role="img" [attr.aria-label]="L('Hakimo', 'Not included')">—</span> }
                    @else { <span class="font-medium text-ink-700">{{ L(c.sw, c.en) }}</span> }
                  </div>
                }
              }
            </div>
          </div>

          <!-- mobile: stacked plan cards -->
          <div class="md:hidden">
            <p class="eyebrow">{{ L('Bei za kisasa', 'Modern pricing') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight">{{ L('Linganisha Bei', 'Pricing Comparison') }}</h2>
            <div class="mt-8 space-y-5">
              @for (p of plans; track p.name; let j = $index) {
                <div class="card p-6" [class.ring-2]="p.featured" [class.ring-brand-500]="p.featured">
                  @if (p.featured) { <span class="badge-success mb-3">{{ L('Maarufu zaidi', 'Most popular') }}</span> }
                  <div class="flex items-baseline justify-between gap-3"><h3 class="text-lg font-semibold">{{ p.name }}</h3>
                    <p class="text-xl font-extrabold tabular">{{ p.price ? 'TZS ' + p.price : L('Maalum', 'Custom') }}</p></div>
                  <ul class="mt-4 space-y-2.5 text-sm">
                    @for (row of matrix; track row.en) {
                      @if (row.cells[j]; as c) {
                        <li class="flex gap-2.5 text-ink-700"><fc-icon name="check" [size]="18" [stroke]="2.25" class="text-brand-600" />
                          <span>{{ L(row.sw, row.en) }}@if (c !== true) {: <b>{{ L($any(c).sw, $any(c).en) }}</b>}</span></li>
                      }
                    }
                  </ul>
                  @if (p.price) {
                    <a routerLink="/register" class="btn-lg mt-6 w-full" [class]="p.featured ? 'btn bg-brand-600 text-white hover:bg-brand-500' : 'btn bg-[#0b1828] text-white dark:bg-white dark:text-[#0b1828]'">{{ L('Anza sasa', 'Buy now') }}</a>
                  } @else {
                    <a [href]="mailto('FoleniChap Enterprise')" class="btn-secondary btn-lg mt-6 w-full">{{ L('Wasiliana nasi', 'Contact sales') }}</a>
                  }
                </div>
              }
            </div>
          </div>
        </div>
      </section>

      <!-- ============ Testimonials (only shown once real quotes are added) ============ -->
      <fc-testimonials />

      <!-- ============ FAQ ============ -->
      <section id="faq" class="scroll-mt-20 bg-surface py-20">
        <div class="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 class="text-center text-3xl font-bold tracking-tight">{{ L('Maswali yanayoulizwa mara kwa mara', 'Frequently asked questions') }}</h2>
          <div class="mt-10 divide-y divide-ink-200 rounded-2xl border border-ink-200 bg-surface">
            @for (q of faq; track q.qen; let i = $index) {
              <div>
                <button type="button" class="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-semibold" (click)="open.set(open() === i ? -1 : i)" [attr.aria-expanded]="open() === i">
                  {{ L(q.qsw, q.qen) }}
                  <fc-icon name="chevron-down" [size]="18" class="text-ink-400 transition" [class.rotate-180]="open() === i" />
                </button>
                @if (open() === i) { <p class="animate-fade-up px-5 pb-5 text-sm leading-relaxed text-ink-600">{{ L(q.asw, q.aen) }}</p> }
              </div>
            }
          </div>
        </div>
      </section>

      <!-- ============ Contacts ============ -->
      <section id="contact" class="scroll-mt-20 bg-ink-50 py-20">
        <div class="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <p class="eyebrow">{{ L('Mawasiliano', 'Contacts') }}</p>
            <h2 class="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{{ L('Tuzungumze kuhusu biashara yako', "Let's talk about your business") }}</h2>
            <p class="mt-3 text-ink-600">{{ L('Tunakusaidia kuweka foleni, huduma na malipo bure. Tutajibu ndani ya siku moja ya kazi.', 'We help you set up your queue, services and payments for free. We reply within one working day.') }}</p>
            <ul class="mt-8 space-y-4">
              <li><a [href]="'mailto:' + contact.email" class="flex items-center gap-3 font-medium hover:text-brand-700">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand-700 shadow-card"><fc-icon name="mail" [size]="18" /></span>{{ contact.email }}</a></li>
              @if (contact.whatsapp) {
                <li><a [href]="'https://wa.me/' + contact.whatsapp" target="_blank" rel="noopener" class="flex items-center gap-3 font-medium hover:text-brand-700">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-[#25d366] text-white shadow-card"><fc-icon name="phone" [size]="18" /></span>WhatsApp</a></li>
              }
              @if (contact.phone) {
                <li><a [href]="'tel:' + contact.phone.replaceAll(' ', '')" class="flex items-center gap-3 font-medium hover:text-brand-700">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand-700 shadow-card"><fc-icon name="phone" [size]="18" /></span>{{ contact.phone }}</a></li>
              }
              <li class="flex items-center gap-3 font-medium text-ink-700">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-surface text-brand-700 shadow-card"><fc-icon name="building" [size]="18" /></span>{{ contact.city }}</li>
            </ul>
          </div>
          <!-- Opens the visitor's mail app with the message pre-filled (no backend endpoint needed). -->
          <form class="card space-y-4 p-6 sm:p-8" (ngSubmit)="sendEnquiry()" #f="ngForm">
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block text-sm font-medium">{{ L('Jina lako', 'Your name') }}
                <input class="input mt-1.5" name="name" [(ngModel)]="enquiry.name" required autocomplete="name" /></label>
              <label class="block text-sm font-medium">{{ L('Jina la biashara', 'Business name') }}
                <input class="input mt-1.5" name="business" [(ngModel)]="enquiry.business" autocomplete="organization" /></label>
            </div>
            <label class="block text-sm font-medium">{{ L('Aina ya biashara', 'Business type') }}
              <select class="input mt-1.5" name="type" [(ngModel)]="enquiry.type">
                @for (b of businessTypes; track b.en) { <option [value]="b.en">{{ L(b.sw, b.en) }}</option> }
              </select></label>
            <label class="block text-sm font-medium">{{ L('Ujumbe', 'Message') }}
              <textarea class="input mt-1.5 min-h-28 py-2" name="message" [(ngModel)]="enquiry.message" required></textarea></label>
            <button type="submit" class="btn-primary btn-lg w-full" [disabled]="f.invalid">{{ L('Tuma ujumbe', 'Send message') }}<fc-icon name="arrow-right" [size]="18" /></button>
          </form>
        </div>
      </section>

    </main>

    <!-- ============ Footer (with closing call-to-action) ============ -->
    <footer class="bg-[#0b1828] text-white/70">
      <div class="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
        <div class="rounded-3xl border border-white/10 bg-white/[.04] px-6 py-12 text-center sm:px-12">
          <h2 class="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">
            {{ L('Uko tayari kuondoa foleni?', 'Ready to Eliminate Waiting Lines?') }}<br>
            {{ L('Anza Siku 14 Bure Leo', 'Start Your 14-Day Free Trial Today') }}
          </h2>
          <div class="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a routerLink="/register" class="btn btn-lg bg-brand-500 text-white shadow-lift hover:bg-brand-400">{{ L('Fungua Akaunti Bure', 'Create Free Account') }}</a>
            <a href="#contact" (click)="bookDemo()" class="btn btn-lg border border-brand-400/70 text-brand-300 hover:bg-brand-400/10 hover:text-brand-200">{{ L('Omba Demo', 'Book a Demo') }}</a>
          </div>
        </div>
      </div>

      <div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.3fr_1fr_1.1fr_1.4fr]">
        <div>
          <fc-logo [light]="true" />
          <p class="mt-4 max-w-xs text-sm leading-relaxed">{{ L('Foleni janja na booking ya malipo ya simu kwa Afrika Mashariki.', 'Smart Queue & Mobile Money Booking for East Africa.') }}</p>
          @if (socials.length) {
            <ul class="mt-6 flex gap-3">
              @for (so of socials; track so.label) {
                <li><a [href]="so.url" target="_blank" rel="noopener" [attr.aria-label]="so.label"
                       class="flex h-9 w-9 items-center justify-center rounded-lg text-brand-400 transition hover:bg-white/10 hover:text-brand-300" [innerHTML]="so.svg"></a></li>
              }
            </ul>
          }
        </div>

        @for (col of footerCols; track col.en) {
          <nav [attr.aria-label]="L(col.sw, col.en)">
            <p class="font-semibold text-white">{{ L(col.sw, col.en) }}</p>
            <ul class="mt-4 space-y-3 text-sm">
              @for (l of col.links; track l.en) {
                <li>@if (l.route) { <a [routerLink]="l.route" class="transition hover:text-white">{{ L(l.sw, l.en) }}</a> }
                    @else { <a [href]="l.href" class="transition hover:text-white">{{ L(l.sw, l.en) }}</a> }</li>
              }
            </ul>
          </nav>
        }

        <div>
          <p class="font-semibold text-white">{{ L('Mawasiliano & Msaada', 'Contact & Support') }}</p>
          <ul class="mt-4 space-y-3 text-sm">
            <li>{{ contact.city }}</li>
            @if (contact.whatsapp) { <li><a [href]="'https://wa.me/' + contact.whatsapp" target="_blank" rel="noopener" class="transition hover:text-white">{{ L('Msaada wa WhatsApp', 'WhatsApp Support') }} {{ contact.phone || '+' + contact.whatsapp }}</a></li> }
            @else if (contact.phone) { <li><a [href]="'tel:' + contact.phone.replaceAll(' ', '')" class="transition hover:text-white">{{ contact.phone }}</a></li> }
            <li><a [href]="'mailto:' + contact.email" class="transition hover:text-white">{{ contact.email }}</a></li>
          </ul>
          <ul class="mt-5 flex flex-wrap gap-1.5" [attr.aria-label]="L('Mitandao ya malipo tunayopokea', 'Payment networks we accept')">
            @for (n of payBadges; track n.name) {
              <li class="flex h-12 w-[3.3rem] items-center justify-center whitespace-pre-line rounded-lg px-1 text-center text-[11px] font-extrabold leading-[1.05]" [class]="n.cls">{{ n.name }}</li>
            }
          </ul>
        </div>
      </div>

      <div class="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-white/10 px-4 py-6 text-sm sm:flex-row sm:px-6">
        <p>© {{ year }} FoleniChap. {{ L('Haki zote zimehifadhiwa.', 'All rights reserved.') }}</p>
        <p class="text-white/50">{{ L('Malipo yanachakatwa na AzamPay · Imetengenezwa Tanzania', 'Payments processed by AzamPay · Made in Tanzania') }}</p>
      </div>
    </footer>
  `
})
export class LandingComponent implements OnInit {
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly sw = this.i18n.isSw;
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);
  protected readonly open = signal(0);
  protected readonly menu = signal(false);
  protected readonly qr = signal<string | null>(null);
  protected readonly year = new Date().getFullYear();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly contact = CONTACT;
  protected readonly enquiry = { name: '', business: '', type: 'Clinic', message: '' };

  constructor() {
    // Keep router-driven anchor scrolls (back/forward, /#pricing links from other pages) clear of the sticky header.
    inject(ViewportScroller).setOffset([0, 72]);
    // Opening the page directly on /#section: jump there once the sections have rendered.
    afterNextRender(() => { if (location.hash) this.scrollTo(location.hash.slice(1), false); });
  }

  /**
   * In-page links (href="#id"). Without this the Angular router treats the hash change as a navigation and
   * scrollPositionRestoration:'top' sends the page back to the top instead of to the section.
   */
  protected onAnchorClick(e: MouseEvent): void {
    if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    const id = a?.getAttribute('href')?.slice(1);
    if (!id || !document.getElementById(id)) return;
    e.preventDefault();
    a!.blur(); // closes the hover/focus Features dropdown
    history.replaceState(history.state, '', '#' + id);
    // Close the mobile menu first and scroll on the next frame: the open menu sits in the sticky header and
    // pushes the page down, so measuring before it collapses would land ~its height off target.
    this.menu.set(false);
    requestAnimationFrame(() => this.scrollTo(id, true));
  }

  private scrollTo(id: string, smooth: boolean): boolean {
    const el = document.getElementById(id);
    if (!el) return false;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' }); // honours each section's scroll-mt-*
    return true;
  }

  ngOnInit(): void {
    // A real, scannable QR that opens sign-up, rather than a fake pattern.
    QRCode.toDataURL(`${location.origin}/register`, { margin: 0, width: 240, color: { dark: '#14201c', light: '#ffffff' } })
      .then(url => this.qr.set(url)).catch(() => {});
  }

  protected mailto(subject: string, body = ''): string {
    return `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}${body ? '&body=' + encodeURIComponent(body) : ''}`;
  }

  protected sendEnquiry(): void {
    const e = this.enquiry;
    const body = `${e.message}\n\n--\n${e.name}${e.business ? ' · ' + e.business : ''}\n${e.type}`;
    location.href = this.mailto(`FoleniChap enquiry${e.business ? ' - ' + e.business : ''}`, body);
  }

  protected readonly featureMenu = [
    { href: '#tour-qr', icon: 'qr', sw: 'Kujiunga kwa QR', en: 'QR check-in', dsw: 'Wateja wanajiunga kwa simu', den: 'Customers join from their phone' },
    { href: '#tour-pay', icon: 'wallet', sw: 'Malipo ya simu', en: 'Mobile money', dsw: 'M-Pesa, Mixx, Airtel na zaidi', den: 'M-Pesa, Mixx, Airtel & more' },
    { href: '#tour-alerts', icon: 'bell', sw: 'Taarifa za WhatsApp', en: 'WhatsApp alerts', dsw: 'Arifa zamu ikikaribia', den: 'Alerts when the turn is near' },
    { href: '#dashboard', icon: 'chart', sw: 'Dashibodi ya msimamizi', en: 'Admin dashboard', dsw: 'Takwimu za moja kwa moja', den: 'Real-time analytics' },
    { href: '#industries', icon: 'building', sw: 'Sekta', en: 'Industries', dsw: 'Kliniki, saluni, car wash', den: 'Clinics, salons, car washes' },
    { href: '#security', icon: 'shield', sw: 'Usalama', en: 'Security', dsw: 'Data na malipo salama', den: 'Protected data and payments' }
  ];
  protected readonly mobileNav = [
    { href: '#product-tour', sw: 'Bidhaa', en: 'Products' }, { href: '#features', sw: 'Vipengele', en: 'Features' },
    { href: '#industries', sw: 'Sekta', en: 'Industries' },
    { href: '#how', sw: 'Inavyofanya kazi', en: 'How it works' }, { href: '#pricing', sw: 'Bei', en: 'Pricing' },
    { href: '#faq', sw: 'Maswali', en: 'FAQ' }, { href: '#contact', sw: 'Mawasiliano', en: 'Contacts' }
  ];
  protected readonly footerCols = [
    { sw: 'Bidhaa', en: 'Product', links: [
      { sw: 'Vipengele', en: 'Features', href: '#features' },
      ...(DEMO_SLUG ? [{ sw: 'Demo hai', en: 'Live Demo', route: '/b/' + DEMO_SLUG }] : []),
      { sw: 'Bei', en: 'Pricing', href: '#pricing' },
      DEMO_SLUG ? { sw: 'Skrini ya TV', en: 'TV Display Mode', route: '/tv/' + DEMO_SLUG } : { sw: 'Skrini ya TV', en: 'TV Display Mode', href: '#how' },
      { sw: 'Kujiunga kwa QR', en: 'QR Check-In', href: '#tour-qr' }] },
    { sw: 'Suluhisho', en: 'Solutions', links: [
      { sw: 'Kliniki & Hospitali', en: 'For Clinics & Hospitals', href: '#industry-clinics' },
      { sw: 'Saluni & Vinyozi', en: 'For Salons & Barbershops', href: '#industry-salons' },
      { sw: 'Car Wash', en: 'For Car Washes', href: '#industry-carwash' },
      { sw: 'Ofisi za huduma', en: 'Service Offices', href: '#contact' }] }
  ] as { sw: string; en: string; links: { sw: string; en: string; href?: string; route?: string }[] }[];

  /** Network names as text badges in each network's colours (no third-party logo files). */
  protected readonly payBadges = [
    { name: 'M-PESA', cls: 'bg-white text-[#e60000]' },
    { name: 'Mixx\nby Yas', cls: 'bg-white text-[#3b1f8f]' },
    { name: 'airtel\nMoney', cls: 'bg-[#e40000] text-white' },
    { name: 'HaloPesa', cls: 'bg-white text-[#f26b21]' }
  ];

  /** Social links: only the profiles filled in CONTACT are shown. Icons are static, developer-defined SVG. */
  protected readonly socials = ([
    { label: 'WhatsApp', url: CONTACT.whatsapp ? 'https://wa.me/' + CONTACT.whatsapp : '',
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 20.5l1.3-4A8.5 8.5 0 1 1 8 19.6z"/><path d="M9 8.6c0 3.3 3 6.4 6.4 6.4l1.1-1.6-1.9-1-1 .8c-1-.4-2.2-1.6-2.6-2.6l.8-1-1-1.9z" fill="currentColor" stroke-width="1"/></svg>' },
    { label: 'Instagram', url: CONTACT.instagram,
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>' },
    { label: 'LinkedIn', url: CONTACT.linkedin,
      svg: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm2.5 7v7.5H9V10zm1.25-4a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM11 10v7.5h2.5v-4c0-1 .6-1.7 1.5-1.7s1.3.7 1.3 1.7v4h2.5V13c0-2.2-1.2-3.2-2.9-3.2-1.2 0-2 .6-2.4 1.2V10z"/></svg>' },
    { label: 'X', url: CONTACT.x,
      svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l16 16M20 4 4 20" /></svg>' }
  ]).filter(so => so.url).map(so => ({ ...so, svg: this.sanitizer.bypassSecurityTrustHtml(so.svg) }));

  protected bookDemo(): void {
    this.enquiry.type = this.enquiry.type || 'Clinic';
    if (!this.enquiry.message) this.enquiry.message = this.L('Ningependa kuoneshwa demo ya FoleniChap.', 'I would like to book a FoleniChap demo.');
  }

  protected readonly networks = ['M-Pesa', 'Mixx by Yas', 'Airtel Money', 'HaloPesa', 'AzamPesa'];
  protected readonly businessTypes = [
    { sw: 'Kliniki / Hospitali', en: 'Clinic' }, { sw: 'Saluni / Kinyozi', en: 'Salon' },
    { sw: 'Ofisi / Benki', en: 'Office' }, { sw: 'Car wash', en: 'Car wash' }, { sw: 'Nyingine', en: 'Other' }
  ];

  // --- hero mock data (decorative only)
  protected readonly wave = [0.6, 1.4, 2.2, 1.2, 1.8, 0.8];
  protected readonly corners = ['left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-md', 'right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-md',
    'left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-md', 'right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-md'];
  protected readonly sideMenu = ['Dashboard', 'Queue', 'Services', 'Customers', 'Payments', 'Staff', 'Settings'];
  protected readonly bars = [40, 65, 50, 85, 70, 95, 60];
  protected readonly queueRows = [
    { name: 'Neema J.', no: 'G-031', sw: 'Inahudumiwa', en: 'Serving', cls: 'bg-[#d7f2e5] text-[#0e513c]', t: '0 min', c: '#7ccfae' },
    { name: 'Baraka M.', no: 'G-032', sw: 'Imelipwa', en: 'Paid', cls: 'bg-[#e0f2fe] text-[#075985]', t: '4 min', c: '#93c5fd' },
    { name: 'Asha K.', no: 'G-033', sw: 'Imelipwa', en: 'Paid', cls: 'bg-[#e0f2fe] text-[#075985]', t: '8 min', c: '#fcd34d' },
    { name: 'Juma S.', no: 'D-015', sw: 'Malipo yanasubiri', en: 'Awaiting pay', cls: 'bg-[#fef3c7] text-[#92400e]', t: '11 min', c: '#fda4af' },
    { name: 'Rehema P.', no: 'D-016', sw: 'Imeghairiwa', en: 'No-show', cls: 'bg-[#ffe4e6] text-[#9f1239]', t: '15 min', c: '#c4b5fd' },
    { name: 'Musa T.', no: 'G-034', sw: 'Inasubiri', en: 'Waiting', cls: 'bg-[#eef2f0] text-[#4c5955]', t: '18 min', c: '#a5f3fc' }
  ];
  protected readonly payments = [
    { n: 'Asha Kimaro', a: '16,000', c: '#fcd34d' }, { n: 'Baraka M.', a: '10,000', c: '#93c5fd' },
    { n: 'Neema J.', a: '25,000', c: '#7ccfae' }, { n: 'Hassan O.', a: '8,000', c: '#fda4af' }
  ];
  protected readonly tvRows = [
    { no: 'G-031', sw: 'Dirisha', en: 'Counter', at: 'A', time: '09:00' },
    { no: 'D-014', sw: 'Chumba', en: 'Room', at: '2', time: '09:05' },
    { no: 'G-032', sw: 'Dirisha', en: 'Counter', at: 'B', time: '09:12' },
    { no: 'G-033', sw: 'Dirisha', en: 'Counter', at: 'A', time: '09:20' },
    { no: 'D-015', sw: 'Chumba', en: 'Room', at: '1', time: '09:30' }
  ];

  protected readonly steps = [
    { icon: 'building', tsw: 'Sajili biashara', ten: 'Register your business', dsw: 'Weka huduma, ada na madirisha yako. Dakika chache tu.', den: 'Add your services, fees and counters in a few minutes.' },
    { icon: 'qr', tsw: 'Bandika QR yako', ten: 'Put up your QR code', dsw: 'Chapisha QR mapokezi au tuma link kwa WhatsApp. Wateja wanajiunga wenyewe.', den: 'Print it at reception or share the link on WhatsApp. Customers join by themselves.' },
    { icon: 'desk', tsw: 'Hudumia kwa mpangilio', ten: 'Serve in order', dsw: 'Bofya "Ita anayefuata". Mteja anaarifiwa na TV inaonyesha namba yake.', den: 'Press "Call next". The customer is alerted and the TV shows their number.' }
  ];
  protected readonly security = [
    { icon: 'lock', tsw: 'Data yako ni yako tu', ten: 'Your data stays yours', dsw: 'Kila biashara imetenganishwa kabisa na nyingine.', den: 'Every business is fully isolated from the others.' },
    { icon: 'check-circle', tsw: 'Malipo yanathibitishwa', ten: 'Verified payments', dsw: 'Kila malipo yanakaguliwa kiasi na chanzo kabla ya kukubaliwa.', den: 'Every payment is checked for amount and source before it counts.' },
    { icon: 'shield', tsw: 'Ulinzi wa kuingia', ten: 'Protected sign-in', dsw: 'Nenosiri imara, kufungiwa baada ya majaribio mengi, vikao salama.', den: 'Strong passwords, lockout after repeated failures, secure sessions.' },
    { icon: 'globe', tsw: 'HTTPS kila mahali', ten: 'Encrypted everywhere', dsw: 'Mawasiliano yote yamesimbwa kwa TLS.', den: 'All traffic is encrypted with TLS.' }
  ];

  // Starter & Pro mirror SubscriptionPlan.java / application.yml. Enterprise is sales-led (no self-serve price).
  protected readonly plans = [
    { name: 'Starter', price: '35,000', featured: false },
    { name: 'Pro', price: '75,000', featured: true },
    { name: 'Enterprise', price: '', featured: false }
  ];
  protected readonly matrix: { sw: string; en: string; cells: Cell[] }[] = [
    { sw: 'Matawi', en: 'Branches', cells: [txt('1'), txt('3'), UNLIMITED] },
    { sw: 'Madirisha / wahudumu', en: 'Counters / agents', cells: [txt('3'), UNLIMITED, UNLIMITED] },
    { sw: 'Foleni ya QR moja kwa moja', en: 'Live QR queue', cells: [true, true, true] },
    { sw: 'Dashibodi ya mapokezi & TV', en: 'Reception desk & TV board', cells: [true, true, true] },
    { sw: 'Malipo ya M-Pesa & Mixx (STK)', en: 'M-Pesa & Mixx STK payments', cells: [false, true, true] },
    { sw: 'Taarifa za WhatsApp & SMS', en: 'WhatsApp & SMS alerts', cells: [false, txt('300 / mwezi', '300 / mo'), txt('Kwa mahitaji', 'Custom volume')] },
    { sw: 'Takwimu za mapato', en: 'Revenue analytics', cells: [false, true, true] },
    { sw: 'Msaada wa kipaumbele', en: 'Priority onboarding & support', cells: [false, false, true] }
  ];

  protected readonly faq = [
    { qsw: 'Wateja wangu wanahitaji kupakua programu?', qen: 'Do my customers need to install an app?',
      asw: 'Hapana. Wanascan QR au kufungua link kwenye kivinjari cha simu yoyote. Wasio na simu janja wanaandikishwa na mapokezi.',
      aen: 'No. They scan the QR code or open the link in any phone browser. Customers without a smartphone are added by reception.' },
    { qsw: 'Pesa za malipo zinaingia wapi?', qen: 'Where does the payment money go?',
      asw: 'Malipo yanapitia AzamPay, mtoa huduma wa malipo aliyesajiliwa Tanzania, na yanathibitishwa kabla tiketi kuonekana imelipwa.',
      aen: 'Payments go through AzamPay, a licensed Tanzanian payment provider, and are verified before a ticket shows as paid.' },
    { qsw: 'Je, data za biashara yangu zinaweza kuonwa na wengine?', qen: 'Can other businesses see my data?',
      asw: 'Hapana. Kila biashara imetenganishwa: wafanyakazi wako wanaona data yako tu.', aen: 'No. Every business is isolated: your staff only ever see your own data.' },
    { qsw: 'Nikiamua kuacha?', qen: 'What if I want to stop?',
      asw: 'Hakuna mkataba. Usipolipia mwezi unaofuata, akaunti inasimamishwa tu.', aen: 'There is no contract. If you do not pay for the next month the account is simply paused.' }
  ];
}
