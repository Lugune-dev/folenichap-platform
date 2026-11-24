import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; text: string; kind: 'success' | 'error' | 'info'; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  success(text: string) { this.push(text, 'success'); }
  error(text: string) { this.push(text, 'error'); }
  info(text: string) { this.push(text, 'info'); }

  dismiss(id: number) { this.toasts.update(list => list.filter(t => t.id !== id)); }

  private push(text: string, kind: Toast['kind']) {
    const id = ++this.seq;
    this.toasts.update(list => [...list.slice(-3), { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3500);
  }
}
