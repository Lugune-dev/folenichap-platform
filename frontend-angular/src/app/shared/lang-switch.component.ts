import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n.service';

/** Segmented SW / EN control. */
@Component({
  selector: 'fc-lang-switch',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="inline-flex rounded-full p-0.5 text-2xs font-semibold" role="group" aria-label="Language / Lugha"
      [class]="onDark() ? 'bg-white/15 text-white ring-1 ring-inset ring-white/20' : 'bg-ink-100 text-ink-600'">
      @for (l of langs; track l) {
        <button type="button" (click)="i18n.set(l)" class="rounded-full px-2.5 py-1 uppercase transition" [attr.aria-pressed]="i18n.lang() === l"
          [class]="i18n.lang() === l ? (onDark() ? 'bg-surface text-brand-800 shadow-sm' : 'bg-surface text-ink shadow-sm') : ''">{{ l }}</button>
      }
    </div>
  `
})
export class LangSwitchComponent {
  readonly onDark = input(false);
  protected readonly i18n = inject(I18nService);
  protected readonly langs = ['sw', 'en'] as const;
}
