import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { ThemeService } from '../core/theme.service';
import { IconComponent } from './icon.component';

/** Sun / moon button that switches between light and dark theme. */
@Component({
    selector: 'fc-theme-toggle',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <button type="button" (click)="theme.toggle()" [attr.aria-label]="label()" [title]="label()"
      [attr.aria-pressed]="isDark()"
      class="inline-flex h-8 w-8 items-center justify-center rounded-full transition"
      [class]="onDark() ? 'bg-white/15 text-white ring-1 ring-inset ring-white/20 hover:bg-white/25' : 'bg-ink-100 text-ink-600 hover:text-ink'">
      <fc-icon [name]="isDark() ? 'sun' : 'moon'" [size]="16" />
    </button>
  `
})
export class ThemeToggleComponent {
  readonly onDark = input(false);
  protected readonly theme = inject(ThemeService);
  private readonly i18n = inject(I18nService);
  protected readonly isDark = computed(() => this.theme.theme() === 'dark');
  protected readonly label = computed(() => this.isDark()
    ? (this.i18n.isSw() ? 'Badili kwenda mandhari ya mwanga' : 'Switch to light theme')
    : (this.i18n.isSw() ? 'Badili kwenda mandhari ya giza' : 'Switch to dark theme'));
}
