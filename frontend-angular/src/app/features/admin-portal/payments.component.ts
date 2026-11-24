import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { API } from '../../core/api';
import { dateTime, money } from '../../core/format';
import { I18nService } from '../../core/i18n.service';
import { Page, PaymentView } from '../../core/models';

import { IconComponent } from '../../shared/icon.component';
@Component({
    selector: 'fc-payments',
    imports: [IconComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <div class="page-header">
      <div>
        <h1 class="page-title">{{ t('admin.payments') }}</h1>
        <p class="page-subtitle">{{ i18n.isSw() ? 'Malipo yote ya simu na taslimu, yaliyothibitishwa na mfumo.' : 'Every mobile money and cash payment, verified by the system.' }}</p>
      </div>
      <span class="badge-success py-1"><fc-icon name="shield" [size]="14" />{{ i18n.isSw() ? 'Yamethibitishwa kiasi na chanzo' : 'Amount & source verified' }}</span>
    </div>

    <div class="card overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full">
          <thead><tr><th class="table-th">{{ i18n.isSw() ? 'Tarehe' : 'Date' }}</th><th class="table-th">{{ i18n.isSw() ? 'Kumbukumbu' : 'Reference' }}</th><th class="table-th">{{ i18n.isSw() ? 'Aina' : 'Type' }}</th>
            <th class="table-th">{{ i18n.isSw() ? 'Mtandao' : 'Network' }}</th><th class="table-th">{{ t('auth.phone') }}</th><th class="table-th text-right">{{ i18n.isSw() ? 'Kiasi' : 'Amount' }}</th><th class="table-th">{{ i18n.isSw() ? 'Hali' : 'Status' }}</th></tr></thead>
          <tbody>
            @for (p of page()?.items ?? []; track p.id) {
              <tr class="transition hover:bg-ink-50/50">
                <td class="table-td whitespace-nowrap tabular text-ink-500">{{ fmtDate(p.createdAt) }}</td>
                <td class="table-td"><p class="font-mono text-xs font-semibold text-ink">{{ p.reference }}</p>@if (p.providerTransactionId) { <p class="font-mono text-2xs text-ink-400">{{ p.providerTransactionId }}</p> }</td>
                <td class="table-td text-xs">{{ p.type }}</td><td class="table-td">{{ p.provider }}</td><td class="table-td tabular">{{ p.msisdn ?? '—' }}</td>
                <td class="table-td text-right font-semibold tabular text-ink">{{ fmtMoney(p.amount, p.currency) }}</td>
                <td class="table-td" [title]="p.failureReason ?? ''">
                  @switch (p.status) {
                    @case ('SUCCESS') { <span class="badge-success"><span class="dot"></span>{{ i18n.isSw() ? 'Imefanikiwa' : 'Success' }}</span> }
                    @case ('FAILED') { <span class="badge-danger"><span class="dot"></span>{{ i18n.isSw() ? 'Imeshindwa' : 'Failed' }}</span> }
                    @case ('PENDING') { <span class="badge-warning"><span class="dot animate-pulse"></span>{{ i18n.isSw() ? 'Inasubiri' : 'Pending' }}</span> }
                    @default { <span class="badge-neutral">{{ p.status }}</span> }
                  }
                  @if (p.failureReason && p.status === 'FAILED') { <p class="mt-1 max-w-[14rem] truncate text-2xs text-ink-400">{{ p.failureReason }}</p> }
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="table-td py-14 text-center">
                <span class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"><fc-icon name="wallet" [size]="22" /></span>
                <p class="mt-3 font-semibold text-ink">{{ i18n.isSw() ? 'Bado hakuna malipo' : 'No payments yet' }}</p></td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (page(); as pg) {
        @if (pages(pg) > 1) {
          <div class="flex items-center justify-between border-t border-ink-100 px-5 py-3 text-sm">
            <span class="text-ink-500">{{ i18n.isSw() ? 'Ukurasa' : 'Page' }} {{ pg.page + 1 }} / {{ pages(pg) }}</span>
            <div class="flex gap-2">
              <button class="btn-secondary btn-sm" [disabled]="pg.page === 0" (click)="load(pg.page - 1)"><fc-icon name="arrow-left" [size]="14" /></button>
              <button class="btn-secondary btn-sm" [disabled]="pg.page + 1 >= pages(pg)" (click)="load(pg.page + 1)"><fc-icon name="arrow-right" [size]="14" /></button>
            </div>
          </div>
        }
      }
    </div>
  `
})
export class PaymentsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  protected readonly i18n = inject(I18nService);
  protected readonly t = this.i18n.t;
  protected readonly fmtDate = dateTime;
  protected readonly fmtMoney = money;
  protected readonly page = signal<Page<PaymentView> | null>(null);

  ngOnInit(): void { this.load(0); }

  load(p: number): void {
    this.http.get<Page<PaymentView>>(`${API}/admin/payments`, { params: { page: p, size: 25 } }).subscribe(pg => this.page.set(pg));
  }

  pages(pg: Page<PaymentView>): number { return Math.max(1, Math.ceil(pg.total / pg.size)); }
}
