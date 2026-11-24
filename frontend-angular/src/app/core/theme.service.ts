import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'fc.theme';

/**
 * Light / dark theme. The choice is saved per browser; first visit follows the OS setting.
 * index.html applies the saved class before Angular boots so there is no flash of the wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>(this.initial());
  readonly theme = this._theme.asReadonly();

  constructor() { this.apply(this._theme()); }

  set(theme: Theme): void {
    this._theme.set(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* private mode */ }
    this.apply(theme);
  }

  toggle(): void { this.set(this._theme() === 'dark' ? 'light' : 'dark'); }

  private apply(theme: Theme): void {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1512' : '#0f6549');
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* ignore */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}
