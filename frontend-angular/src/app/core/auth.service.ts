import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, firstValueFrom, map, of, shareReplay, tap } from 'rxjs';
import { API } from './api';
import { I18nService } from './i18n.service';
import { Role, TokenResponse, UserView } from './models';

/** Non-secret profile, kept only so the UI can render instantly after a reload. */
const USER = 'fc.user';

/**
 * Session handling.
 * - The refresh token lives in an HttpOnly cookie set by the server: JavaScript never sees it.
 * - The short-lived access token lives only in memory (lost on reload, restored via {@link restore}).
 * So an XSS bug cannot read or exfiltrate a long-lived credential.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18nService);

  private readonly _user = signal<UserView | null>(this.read<UserView>(USER));
  private readonly _access = signal<string | null>(null);
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user() && !!this._access());
  readonly role = computed<Role | null>(() => this._user()?.role ?? null);

  private refreshing$: Observable<string> | null = null;

  get accessToken(): string | null { return this._access(); }

  /** True when a session may exist (we have a cached profile), so a refresh is worth trying. */
  get hasSession(): boolean { return !!this._user(); }

  login(email: string, password: string): Observable<UserView> {
    return this.http.post<TokenResponse>(`${API}/auth/login`, { email, password }, { withCredentials: true }).pipe(
      tap(res => this.store(res)), map(res => res.user));
  }

  register(body: Record<string, unknown>): Observable<TokenResponse> {
    return this.http.post<TokenResponse>(`${API}/auth/register`, body, { withCredentials: true }).pipe(
      tap(res => { if (res.accessToken) this.store(res); }));
  }

  /** Single-flight refresh shared by all concurrent 401s. The cookie is sent automatically. */
  refresh(): Observable<string> {
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<TokenResponse>(`${API}/auth/refresh`, {}, { withCredentials: true }).pipe(
        tap(res => this.store(res)),
        map(res => res.accessToken as string),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1));
    }
    return this.refreshing$;
  }

  /** Runs once at start-up: turns the HttpOnly cookie back into an in-memory access token. */
  restore(): Promise<void> {
    if (!this.hasSession) return Promise.resolve();
    return firstValueFrom(this.refresh().pipe(
      map(() => void 0),
      catchError(() => { this.clear(); return of(void 0); })));
  }

  logout(redirect = true): void {
    this.http.post(`${API}/auth/logout`, {}, { withCredentials: true }).subscribe({ error: () => void 0 });
    this.clear();
    if (redirect) this.router.navigateByUrl('/login');
  }

  homeFor(role: Role | null): string {
    switch (role) {
      case 'SUPER_ADMIN': return '/super';
      case 'TENANT_ADMIN': return '/admin';
      case 'STAFF': return '/desk';
      default: return '/login';
    }
  }

  private clear(): void {
    this._access.set(null);
    this._user.set(null);
    try { localStorage.removeItem(USER); } catch { /* storage unavailable */ }
  }

  private store(res: TokenResponse): void {
    if (res.accessToken) this._access.set(res.accessToken);
    try { localStorage.setItem(USER, JSON.stringify(res.user)); } catch { /* storage unavailable */ }
    this._user.set(res.user);
    if (res.user.language === 'sw' || res.user.language === 'en') this.i18n.set(res.user.language);
  }

  private read<T>(key: string): T | null {
    try {
      // tokens stored in localStorage by older versions of the app are wiped
      localStorage.removeItem('fc.access');
      localStorage.removeItem('fc.refresh');
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) as T : null;
    } catch { return null; }
  }
}
