import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API } from './api';
import { AuthService } from './auth.service';
import { I18nService } from './i18n.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/** Adds the JWT and transparently refreshes it once on 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const i18n = inject(I18nService);
  const isApi = req.url.startsWith(API);
  const isAuthCall = req.url.startsWith(`${API}/auth/`);
  const isPublic = req.url.startsWith(`${API}/public/`);

  let request = isApi ? req.clone({ setHeaders: { 'Accept-Language': i18n.lang() } }) : req;
  if (isApi && !isAuthCall && !isPublic) {
    request = withToken(request, auth.accessToken);
  }

  return next(request).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && isApi && !isAuthCall && !isPublic
          && auth.hasSession) {
        return auth.refresh().pipe(
          switchMap(token => next(withToken(request, token))),
          catchError(refreshErr => {
            auth.logout();
            return throwError(() => refreshErr);
          }));
      }
      return throwError(() => err);
    }));
};
