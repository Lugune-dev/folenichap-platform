import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { I18nService } from '../core/i18n.service';
import { PwaService } from '../core/pwa.service';
import { IconComponent } from './icon.component';

const DISMISS_KEY = 'fc.installDismissedAt';
const DISMISS_DAYS = 14;

/** Offline notice, "new version" notice and the install-the-app card. Mounted once in the root component. */
@Component({
    selector: 'fc-pwa-bar',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    @if (!pwa.online()) {
      <div class="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-accent-400 px-4 py-1.5 text-center text-xs font-semibold text-night-950" role="status">
        <fc-icon name="wifi" [size]="14" />{{ L('Hakuna intaneti. Tutaendelea ukirudi mtandaoni.', 'You are offline. We will continue when you are back online.') }}
      </div>
    }

    @if (pwa.updateReady()) {
      <div class="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-night-900 p-3 pl-4 text-sm text-white shadow-lift sm:inset-x-auto sm:right-4" role="status">
        <fc-icon name="refresh" [size]="18" class="text-brand-300" />
        <span class="flex-1">{{ L('Toleo jipya la FoleniChap lipo.', 'A new version of FoleniChap is ready.') }}</span>
        <button type="button" class="btn btn-sm bg-brand-500 text-white hover:bg-brand-400" (click)="pwa.applyUpdate()">{{ L('Pakia upya', 'Reload') }}</button>
      </div>
    } @else if (showInstall()) {
      <div class="animate-slide-in fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-ink-200 bg-surface p-4 text-sm shadow-lift sm:inset-x-auto sm:right-4"
           role="dialog" [attr.aria-label]="L('Weka app', 'Install the app')">
        <img src="assets/icons/icon-192.png" alt="" class="h-11 w-11 rounded-xl" />
        <div class="flex-1">
          <p class="font-semibold text-ink">{{ L('Weka FoleniChap kwenye simu yako', 'Install FoleniChap on your phone') }}</p>
          @if (pwa.canInstall()) {
            <p class="mt-0.5 text-ink-500">{{ L('Inafunguka haraka kama app, bila Play Store.', 'Opens fast like an app, no app store needed.') }}</p>
            <button type="button" class="btn-primary btn-sm mt-3" (click)="install()"><fc-icon name="download" [size]="15" />{{ L('Weka sasa', 'Install') }}</button>
          } @else {
            <p class="mt-0.5 text-ink-500">{{ L('Kwenye Safari bofya', 'In Safari tap') }}
              <span class="inline-flex translate-y-0.5 text-sky-600" [attr.aria-label]="L('Shiriki', 'Share')"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span>
              {{ L('kisha "Add to Home Screen".', 'then "Add to Home Screen".') }}</p>
          }
        </div>
        <button type="button" class="btn-icon -mr-2 -mt-2 h-8 w-8" (click)="dismiss()" [attr.aria-label]="L('Funga', 'Close')"><fc-icon name="x" [size]="16" /></button>
      </div>
    }
  `
})
export class PwaBarComponent {
  protected readonly pwa = inject(PwaService);
  private readonly i18n = inject(I18nService);
  protected readonly L = (sw: string, en: string) => this.i18n.pick(sw, en);

  private readonly url = toSignal(inject(Router).events.pipe(filter(e => e instanceof NavigationEnd), map(e => (e as NavigationEnd).urlAfterRedirects)), { initialValue: '' });
  private readonly dismissed = signal(this.recentlyDismissed());

  /** Offer install to business users only - not on the customer ticket pages or the waiting-room TV. */
  protected readonly showInstall = computed(() => {
    const path = this.url().split(/[?#]/)[0];
    const businessPage = path === '/' || /^\/(login|register|desk|admin|super)(\/|$)/.test(path);
    return businessPage && !this.dismissed() && !this.pwa.installed() && (this.pwa.canInstall() || this.pwa.showIosHint());
  });

  protected async install(): Promise<void> {
    if (!(await this.pwa.install())) this.dismiss();
  }

  protected dismiss(): void {
    this.dismissed.set(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* storage unavailable */ }
  }

  private recentlyDismissed(): boolean {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      return !!at && Date.now() - at < DISMISS_DAYS * 86_400_000;
    } catch { return false; }
  }
}
