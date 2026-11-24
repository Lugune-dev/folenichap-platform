import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';

/**
 * Thin top progress bar while a page (and its lazy code) loads, like modern web apps.
 * Only appears if navigation takes longer than ~150 ms, so fast clicks don't flicker.
 */
@Component({
  selector: 'fc-route-progress',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { position: fixed; inset: 0 0 auto 0; z-index: 70; height: 3px; pointer-events: none; }
    .bar {
      height: 100%; width: 0; opacity: 0;
      background: linear-gradient(90deg, #209a70, #45b48b, #7ccfae);
      box-shadow: 0 0 10px rgba(69, 180, 139, .7), 0 0 4px rgba(69, 180, 139, .5);
      transition: width .25s ease, opacity .3s ease .15s;
    }
    .bar.loading { opacity: 1; width: 80%; transition: width 8s cubic-bezier(.1, .7, .2, 1), opacity .1s; }
    .bar.done { opacity: 0; width: 100%; transition: width .2s ease, opacity .35s ease .2s; }
    @media (prefers-reduced-motion: reduce) { .bar, .bar.loading, .bar.done { transition: opacity .2s; } }
  `],
  template: `<div class="bar" [class.loading]="state() === 'loading'" [class.done]="state() === 'done'" role="progressbar"
                  [attr.aria-hidden]="state() !== 'loading'" aria-label="Loading"></div>`
})
export class RouteProgressComponent {
  protected readonly state = signal<'idle' | 'loading' | 'done'>('idle');
  private showTimer?: ReturnType<typeof setTimeout>;
  private resetTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(Router).events.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(e => {
      if (e instanceof NavigationStart) {
        clearTimeout(this.resetTimer);
        clearTimeout(this.showTimer);
        this.showTimer = setTimeout(() => this.state.set('loading'), 150);
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) {
        clearTimeout(this.showTimer);
        if (this.state() !== 'loading') return;
        this.state.set('done');
        this.resetTimer = setTimeout(() => this.state.set('idle'), 600);
      }
    });
  }
}
