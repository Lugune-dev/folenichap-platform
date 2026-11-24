import { DestroyRef, Injectable, NgZone, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/** Chrome/Edge/Samsung Internet fire this before showing their own install UI. Not in lib.dom yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Everything "works like an app": install prompt, iOS install hint, new-version notice and online/offline state.
 * The service worker itself only caches the app shell (see ngsw-config.json) - never API data.
 */
@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly sw = inject(SwUpdate);
  private deferred: BeforeInstallPromptEvent | null = null;

  /** Android / desktop Chrome: we hold the browser's install prompt and show our own button. */
  readonly canInstall = signal(false);
  /** iPhone Safari has no install prompt - users need "Share > Add to Home Screen". */
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !('MSStream' in window);
  readonly installed = signal(this.standalone());
  readonly updateReady = signal(false);
  readonly online = signal(navigator.onLine);
  readonly showIosHint = computed(() => this.isIos && !this.installed());

  constructor() {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      this.deferred = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });
    window.addEventListener('appinstalled', () => { this.installed.set(true); this.canInstall.set(false); this.deferred = null; });
    window.addEventListener('online', () => this.online.set(true));
    window.addEventListener('offline', () => this.online.set(false));

    if (this.sw.isEnabled) {
      this.sw.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), takeUntilDestroyed(inject(DestroyRef)))
        .subscribe(() => this.updateReady.set(true));
      // A broken cached version (e.g. files removed from the server) - reload to recover.
      this.sw.unrecoverable.subscribe(() => location.reload());
      // Phones keep the app open for days: look for a new version every 30 minutes and when it comes back to the front.
      // Outside Angular's zone so the timer doesn't keep the app "unstable" and delay service-worker registration.
      inject(NgZone).runOutsideAngular(() => setInterval(() => this.check(), 30 * 60_000));
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.check(); });
    }
  }

  async install(): Promise<boolean> {
    if (!this.deferred) return false;
    await this.deferred.prompt();
    const { outcome } = await this.deferred.userChoice;
    this.deferred = null;
    this.canInstall.set(false);
    return outcome === 'accepted';
  }

  /** Activate the downloaded version and reload into it. */
  async applyUpdate(): Promise<void> {
    try { await this.sw.activateUpdate(); } finally { location.reload(); }
  }

  private check(): void {
    if (this.online()) this.sw.checkForUpdate().catch(() => void 0);
  }

  private standalone(): boolean {
    return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }
}
