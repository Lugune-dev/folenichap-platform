import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'fc-logo',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-2.5" [class.text-white]="light()">
      <svg viewBox="0 0 32 32" class="shrink-0" [attr.width]="size()" [attr.height]="size()" aria-hidden="true">
        <rect width="32" height="32" rx="9" [attr.fill]="light() ? '#ffffff' : '#0f6549'"/>
        <path d="M9 10.5h14M9 16h10M9 21.5h6" [attr.stroke]="light() ? '#0f6549' : '#ffffff'" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="22.5" cy="21.5" r="3" fill="#45b48b"/>
      </svg>
      @if (!compact()) {
        <span class="text-[17px] font-bold tracking-tight">Foleni<span [class.text-brand-700]="!light()" [class.text-brand-300]="light()">Chap</span></span>
      }
    </span>
  `
})
export class LogoComponent {
  readonly light = input(false);
  readonly compact = input(false);
  readonly size = input(30);
}
