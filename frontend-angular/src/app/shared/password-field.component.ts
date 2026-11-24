import { ChangeDetectionStrategy, Component, computed, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconComponent } from './icon.component';

/** Password input with show/hide toggle and an optional live strength checklist. */
@Component({
    selector: 'fc-password-field',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PasswordFieldComponent), multi: true }],
    template: `
    <div class="relative">
      <input [id]="inputId()" class="input pr-11" [class.input-invalid]="invalid()" [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="describedBy()" [type]="shown() ? 'text' : 'password'" [value]="value()" [attr.autocomplete]="autocomplete()"
        [disabled]="disabled()" (input)="onInput($any($event.target).value)" (blur)="touched()" spellcheck="false" autocapitalize="off">
      <button type="button" class="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-400 hover:text-ink"
        (click)="shown.set(!shown())" [attr.aria-label]="shown() ? hideLabel() : showLabel()" [attr.aria-pressed]="shown()">
        <fc-icon [name]="shown() ? 'eye-off' : 'eye'" [size]="18" />
      </button>
    </div>
    @if (rules() && value()) {
      <div class="mt-2.5">
        <div class="flex gap-1" aria-hidden="true">
          @for (i of [0, 1, 2, 3]; track i) {
            <span class="h-1 flex-1 rounded-full transition" [class]="i < score() ? barColor() : 'bg-ink-100'"></span>
          }
        </div>
        <ul class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          @for (r of checks(); track r.label) {
            <li class="flex items-center gap-1.5" [class.text-brand-700]="r.ok" [class.text-ink-500]="!r.ok">
              <fc-icon [name]="r.ok ? 'check' : 'x'" [size]="13" [stroke]="2.25" />{{ r.label }}
            </li>
          }
        </ul>
      </div>
    }
  `
})
export class PasswordFieldComponent implements ControlValueAccessor {
  readonly inputId = input('password');
  readonly autocomplete = input('current-password');
  readonly rules = input(false);
  readonly sw = input(false);
  readonly showLabel = input('Show password');
  readonly hideLabel = input('Hide password');
  /** Set by the parent form when the control is touched and invalid (the host element gets the ng-invalid class, not this input). */
  readonly invalid = input(false);
  readonly describedBy = input<string | null>(null);

  protected readonly value = signal('');
  protected readonly shown = signal(false);
  protected readonly disabled = signal(false);

  protected readonly checks = computed(() => {
    const v = this.value(); const sw = this.sw();
    return [
      { label: sw ? 'Herufi 10+' : '10+ characters', ok: v.length >= 10 },
      { label: sw ? 'Herufi kubwa A-Z' : 'Upper-case A-Z', ok: /[A-Z]/.test(v) },
      { label: sw ? 'Herufi ndogo a-z' : 'Lower-case a-z', ok: /[a-z]/.test(v) },
      { label: sw ? 'Namba 0-9' : 'A number 0-9', ok: /\d/.test(v) }
    ];
  });
  protected readonly score = computed(() => this.checks().filter(c => c.ok).length);
  protected readonly barColor = computed(() => ['bg-rose-500', 'bg-rose-500', 'bg-accent-400', 'bg-accent-400', 'bg-brand-500'][this.score()]);

  private onChange: (v: string) => void = () => void 0;
  protected touched: () => void = () => void 0;

  onInput(v: string): void { this.value.set(v); this.onChange(v); }
  writeValue(v: string | null): void { this.value.set(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.touched = fn; }
  setDisabledState(d: boolean): void { this.disabled.set(d); }
}
