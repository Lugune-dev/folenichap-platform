import { Injectable, NgZone, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API } from './api';
import { BoardSnapshot } from './models';

export type ConnectionState = 'connecting' | 'live' | 'reconnecting';

/**
 * Server-Sent Events wrapper. EventSource reconnects by itself on network drops; we add a
 * watchdog for the cases where the browser gives up (readyState CLOSED) - common on mobile
 * networks and sleeping TVs.
 */
@Injectable({ providedIn: 'root' })
export class SseService {
  private readonly zone = inject(NgZone);

  board(slug: string, branchId?: string, onState?: (s: ConnectionState) => void): Observable<BoardSnapshot> {
    // ngsw-bypass: keep the long-lived event stream away from the service worker (it only serves the app shell).
    const url = `${API}/public/tenants/${encodeURIComponent(slug)}/stream?ngsw-bypass=true${branchId ? `&branchId=${branchId}` : ''}`;
    return new Observable<BoardSnapshot>(subscriber => {
      let source: EventSource | null = null;
      let retryTimer: ReturnType<typeof setTimeout> | undefined;
      let attempts = 0;

      const open = () => {
        onState?.(attempts === 0 ? 'connecting' : 'reconnecting');
        source = new EventSource(url);
        source.addEventListener('open', () => { attempts = 0; this.zone.run(() => onState?.('live')); });
        source.addEventListener('board', (ev: MessageEvent<string>) => {
          try {
            const data = JSON.parse(ev.data) as BoardSnapshot;
            this.zone.run(() => subscriber.next(data));
          } catch { /* ignore malformed frame */ }
        });
        source.addEventListener('error', () => {
          this.zone.run(() => onState?.('reconnecting'));
          if (source?.readyState === EventSource.CLOSED) {
            source.close();
            const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempts++, 5));
            retryTimer = setTimeout(open, delay);
          }
        });
      };

      const onVisible = () => {
        if (document.visibilityState === 'visible' && source?.readyState === EventSource.CLOSED) {
          clearTimeout(retryTimer);
          open();
        }
      };

      this.zone.runOutsideAngular(open);
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        clearTimeout(retryTimer);
        document.removeEventListener('visibilitychange', onVisible);
        source?.close();
      };
    });
  }
}
