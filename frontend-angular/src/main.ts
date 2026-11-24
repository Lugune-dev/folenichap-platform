import { bootstrapApplication } from '@angular/platform-browser';
import { NavigationCancel, NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take, timeout } from 'rxjs';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

/** Fades out the splash from index.html once the first page (incl. its lazy chunk) has rendered. */
function hideSplash(): void {
  const splash = document.getElementById('fc-splash');
  if (!splash) return;
  requestAnimationFrame(() => {
    splash.classList.add('fc-splash-hide');
    splash.setAttribute('aria-hidden', 'true');
    setTimeout(() => splash.remove(), 600);
  });
}

bootstrapApplication(AppComponent, appConfig)
  .then(app => {
    const router = app.injector.get(Router);
    if (router.navigated) { hideSplash(); return; } // first page already finished
    router.events.pipe(
      filter(e => e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError),
      take(1),
      timeout({ first: 15_000, with: () => [null] }) // never leave the splash up forever
    ).subscribe({ next: hideSplash, error: hideSplash });
  })
  .catch(err => {
    console.error(err);
    const text = document.querySelector('#fc-splash .fc-splash-text');
    if (text) text.textContent = 'Imeshindwa kufunguka. Onyesha upya ukurasa · Failed to load. Please refresh.';
  });
