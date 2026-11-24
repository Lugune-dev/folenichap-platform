import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18nService } from '../core/i18n.service';
import { PaymentStatus, TicketStatus } from '../core/models';

const STATUS_CLS: Record<TicketStatus, string> = {
  WAITING: 'badge-warning', CALLED: 'badge-info', SERVING: 'badge-success',
  COMPLETED: 'badge-neutral', NO_SHOW: 'badge-danger', CANCELLED: 'badge-neutral'
};
const PAY_CLS: Record<PaymentStatus, string> = {
  UNPAID: 'badge-danger', PENDING: 'badge-warning', PAID: 'badge-success', WAIVED: 'badge-neutral'
};

@Component({
  selector: 'fc-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="cls()"><span class="dot"></span>{{ i18n.t('status.' + status()) }}</span>`
})
export class StatusBadgeComponent {
  readonly status = input.required<TicketStatus>();
  protected readonly i18n = inject(I18nService);
  protected readonly cls = computed(() => STATUS_CLS[this.status()]);
}

@Component({
  selector: 'fc-pay-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="cls()"><span class="dot" [class.animate-pulse]="status() === 'PENDING'"></span>{{ i18n.t('pay.' + status()) }}</span>`
})
export class PayBadgeComponent {
  readonly status = input.required<PaymentStatus>();
  protected readonly i18n = inject(I18nService);
  protected readonly cls = computed(() => PAY_CLS[this.status()]);
}
