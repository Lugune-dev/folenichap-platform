import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { IconComponent } from './icon.component';

@Component({
    selector: 'fc-toast-host',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4 no-print" aria-live="polite" role="status">
      @for (t of toasts.toasts(); track t.id) {
        <div class="pointer-events-auto flex w-full max-w-sm animate-slide-in items-start gap-3 rounded-2xl border bg-surface p-3.5 text-sm shadow-lift"
          [class.border-brand-200]="t.kind === 'success'" [class.border-rose-200]="t.kind === 'error'" [class.border-ink-200]="t.kind === 'info'">
          <span class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            [class]="t.kind === 'success' ? 'bg-brand-100 text-brand-700' : t.kind === 'error' ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'">
            <fc-icon [name]="t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'" [size]="14" [stroke]="2.25" />
          </span>
          <p class="flex-1 pt-0.5 font-medium text-ink">{{ t.text }}</p>
          <button type="button" class="-m-1 rounded-lg p-1 text-ink-400 hover:bg-ink-100 hover:text-ink" (click)="toasts.dismiss(t.id)" aria-label="Dismiss">
            <fc-icon name="x" [size]="16" />
          </button>
        </div>
      }
    </div>
  `
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
}
