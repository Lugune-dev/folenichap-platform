export function money(amount: number | null | undefined, currency = 'TZS'): string {
  if (amount == null) return '—';
  return `${currency} ${Number(amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function time(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function minutesSince(iso?: string | null, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
}
