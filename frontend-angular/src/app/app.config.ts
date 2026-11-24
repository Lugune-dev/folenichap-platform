import { APP_INITIALIZER, ApplicationConfig, Injectable, inject, isDevMode, provideZoneChangeDetection } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { Title } from '@angular/platform-browser';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { RouterStateSnapshot, TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';

/** Uses a route's `title` when it has one, otherwise falls back to the default so titles never go stale between pages. */
@Injectable()
class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.title.setTitle(this.buildTitle(snapshot) ?? 'FoleniChap — Foleni bila kusimama');
  }
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top', anchorScrolling: 'enabled' })),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Installable app + offline app shell. API responses are never cached (see ngsw-config.json: no dataGroups).
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Restore the session from the HttpOnly refresh cookie before guards run.
    { provide: APP_INITIALIZER, multi: true, deps: [AuthService], useFactory: (auth: AuthService) => () => auth.restore() }
  ]
};
