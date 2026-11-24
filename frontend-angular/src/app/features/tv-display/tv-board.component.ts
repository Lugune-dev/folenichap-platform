import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { interval } from 'rxjs';
import * as QRCode from 'qrcode';
import { absoluteUrl } from '../../core/api';
import { I18nService } from '../../core/i18n.service';
import { BoardSnapshot, BoardTicket } from '../../core/models';
import { ConnectionState, SseService } from '../../core/sse.service';
import { IconComponent } from '../../shared/icon.component';
import { LogoComponent } from '../../shared/logo.component';

/**
 * Full-screen waiting-room board. New calls trigger a two-tone chime and a spoken
 * announcement (Swahili then English). Open /tv/{slug}?branch=<id>&lang=sw on the TV browser.
 */
@Component({
    selector: 'fc-tv-board',
    imports: [IconComponent, LogoComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="relative flex h-screen flex-col overflow-hidden bg-night-950 text-white">
      <div class="pointer-events-none absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-brand-600/20 blur-3xl"></div>
      @if (!started()) {
        <button type="button" (click)="start()" class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-night-950/95 text-2xl font-semibold">
          <span class="flex h-24 w-24 items-center justify-center rounded-3xl bg-brand-600 animate-pulse-ring"><fc-icon name="bell" [size]="44" /></span>
          {{ t('tv.start') }}
        </button>
      }

      <header class="relative flex items-center justify-between border-b border-white/10 px-[3vw] py-[2.2vh]">
        <div class="flex items-center gap-5">
          <fc-logo [light]="true" [compact]="true" [size]="52" />
          <div><h1 class="text-[2.6vw] font-extrabold leading-tight tracking-tight text-white">{{ board()?.businessName }}</h1>
            <p class="text-[1.3vw] text-brand-300">{{ board()?.branchName }}</p></div>
        </div>
        <div class="text-right">
          <p class="text-[3.2vw] font-bold leading-none tabular">{{ clock() }}</p>
          <p class="mt-2 inline-flex items-center gap-2 text-[1vw] font-medium" [class.text-brand-300]="conn() === 'live'" [class.text-accent-300]="conn() !== 'live'">
            <span class="h-2.5 w-2.5 rounded-full" [class]="conn() === 'live' ? 'bg-brand-400' : 'bg-accent-400 animate-pulse'"></span>{{ conn() === 'live' ? 'Live' : '…' }}</p>
        </div>
      </header>

      <main class="relative grid flex-1 grid-cols-3 gap-[2vw] px-[3vw] py-[3vh]">
        <section class="col-span-2 flex min-h-0 flex-col">
          <h2 class="mb-[2vh] text-[1.3vw] font-semibold uppercase tracking-[0.2em] text-brand-300">{{ t('tv.nowServing') }}</h2>
          @if (highlight(); as h) {
            <div class="mb-[3vh] animate-pulse-ring rounded-[2rem] bg-gradient-to-br from-brand-500 to-brand-700 p-[3vh] text-center ring-4 ring-brand-300/40">
              <p class="text-[10vw] font-black leading-none tracking-tight tabular">{{ h.ticketNumber }}</p>
              <p class="mt-[1.5vh] inline-flex items-center gap-4 text-[3.2vw] font-bold"><fc-icon name="arrow-right" [size]="'3.2vw'" [stroke]="2.5" />{{ h.counterLabel }}</p>
            </div>
          }
          <div class="grid flex-1 auto-rows-min grid-cols-2 gap-[1.5vw]">
            @for (s of others(); track s.ticketNumber) {
              <div class="rounded-3xl border border-white/10 bg-white/[.05] p-[2.2vh]">
                <p class="text-[4.4vw] font-black leading-none tabular">{{ s.ticketNumber }}</p>
                <p class="mt-[1vh] text-[1.8vw] font-semibold text-brand-200">{{ s.counterLabel }}</p>
                <p class="text-[1.1vw] text-ink-400">{{ i18n.pick(s.serviceNameSw, s.serviceName) }}</p>
              </div>
            }
          </div>
        </section>

        <aside class="flex min-h-0 flex-col gap-[2vh]">
          <div class="rounded-3xl border border-white/10 bg-white/[.04] p-[2.4vh]">
            <h2 class="text-[1.3vw] font-semibold uppercase tracking-[0.2em] text-brand-300">{{ t('tv.next') }}</h2>
            <div class="mt-[2vh] flex flex-wrap gap-3">
              @for (n of board()?.upNext ?? []; track n) { <span class="rounded-2xl bg-white/10 px-[1vw] py-[0.8vh] text-[2.2vw] font-bold tabular">{{ n }}</span> }
              @empty { <span class="text-[1.4vw] text-ink-400">—</span> }
            </div>
            <p class="mt-[2.5vh] flex items-center gap-3 text-[1.4vw] text-night-300"><fc-icon name="users" [size]="'1.6vw'" />{{ t('tv.waiting') }}: <b class="text-white tabular">{{ board()?.waitingCount ?? 0 }}</b></p>
          </div>
          <div class="rounded-3xl border border-white/10 bg-white/[.04] px-[2.4vh] py-[1vh]">
            @for (s of board()?.services ?? []; track s.serviceId) {
              <div class="flex items-center justify-between border-b border-white/10 py-[1.4vh] text-[1.3vw] last:border-0">
                <span class="flex items-center gap-3"><span class="rounded-lg bg-white/10 px-2 py-0.5 font-mono text-[1vw] font-bold">{{ s.prefix }}</span>{{ i18n.pick(s.nameSw, s.name) }}</span>
                <span class="text-brand-200 tabular">{{ s.waiting }} · ~{{ s.estimatedWaitMinutes }}′</span>
              </div>
            }
          </div>
          @if (qr()) {
            <div class="mt-auto flex items-center gap-5 rounded-3xl bg-white p-[2vh] text-night-900">
              <img [src]="qr()" alt="QR" class="h-[16vh] w-[16vh]">
              <div><p class="text-[1.6vw] font-bold leading-tight">{{ t('tv.scan') }}</p><p class="mt-1 flex items-center gap-2 text-[1vw] text-night-500"><fc-icon name="phone" [size]="'1.1vw'" />M-Pesa · Airtel · Mixx</p></div>
            </div>
          }
        </aside>
      </main>
    </div>
  `
})
export class TvBoardComponent implements OnInit {
  readonly slug = input.required<string>();

  private readonly sse = inject(SseService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;

  protected readonly board = signal<BoardSnapshot | null>(null);
  protected readonly conn = signal<ConnectionState>('connecting');
  protected readonly started = signal(false);
  protected readonly clock = signal(this.now());
  protected readonly qr = signal<string | null>(null);
  protected readonly highlight = computed(() => this.board()?.lastCalled ?? null);
  protected readonly others = computed(() => {
    const h = this.highlight();
    return (this.board()?.nowServing ?? []).filter(s => s.ticketNumber !== h?.ticketNumber).slice(0, 8);
  });

  private audio?: AudioContext;
  private lastKey = '';

  ngOnInit(): void {
    const lang = this.route.snapshot.queryParamMap.get('lang');
    if (lang === 'sw' || lang === 'en') this.i18n.set(lang);
    const branch = this.route.snapshot.queryParamMap.get('branch') ?? undefined;

    interval(1000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.clock.set(this.now()));
    QRCode.toDataURL(absoluteUrl(`/b/${this.slug()}`), { margin: 1, width: 256 }).then(url => this.qr.set(url)).catch(() => void 0);

    this.sse.board(this.slug(), branch, s => this.conn.set(s))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(b => this.onBoard(b));

    // keep the screen awake where supported
    (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock?.request('screen').catch(() => void 0);
  }

  start(): void {
    this.audio = new AudioContext();
    this.started.set(true);
    document.documentElement.requestFullscreen?.().catch(() => void 0);
    this.chime();
  }

  private onBoard(b: BoardSnapshot): void {
    this.board.set(b);
    const lc = b.lastCalled;
    if (!lc) return;
    const key = `${lc.ticketNumber}|${lc.calledAt}|${lc.recallCount}`;
    const isNewCall = this.lastKey !== '' && key !== this.lastKey && (b.lastEvent === 'CALLED' || b.lastEvent === 'RECALLED');
    this.lastKey = key;
    if (isNewCall) this.announce(lc);
  }

  private announce(tk: BoardTicket): void {
    if (!this.started()) return;
    this.chime();
    if (!('speechSynthesis' in window)) return;
    const spaced = tk.ticketNumber.replace('-', ' ').split('').join(' ');
    const sw = new SpeechSynthesisUtterance(`Namba ${spaced}, tafadhali nenda ${tk.counterLabel ?? 'dirishani'}`);
    sw.lang = 'sw-TZ';
    sw.rate = 0.9;
    const en = new SpeechSynthesisUtterance(`Number ${spaced}, please go to ${tk.counterLabel ?? 'the counter'}`);
    en.lang = 'en-GB';
    en.rate = 0.95;
    setTimeout(() => {
      speechSynthesis.cancel();
      if (this.i18n.lang() === 'sw') { speechSynthesis.speak(sw); speechSynthesis.speak(en); }
      else { speechSynthesis.speak(en); speechSynthesis.speak(sw); }
    }, 900);
  }

  /** Two-tone "ding-dong" generated with WebAudio (no audio file to host). */
  private chime(): void {
    const ctx = this.audio;
    if (!ctx) return;
    const tone = (freq: number, at: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.8);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + 0.85);
    };
    tone(880, 0);
    tone(660, 0.35);
  }

  private now(): string {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
}
