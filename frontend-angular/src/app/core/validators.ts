import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Mirrors the backend @StrongPassword rule: 10+ chars with upper, lower and a digit. */
export const strongPassword: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  const v = String(c.value ?? '');
  if (!v) return null;
  const ok = v.length >= 10 && v.length <= 100 && /[A-Z]/.test(v) && /[a-z]/.test(v) && /\d/.test(v);
  return ok ? null : { strongPassword: true };
};

/** Mirrors backend PhoneNumbers.normalize: TZ local (07xx / 06xx) or East African international numbers. */
export const eaMobile: ValidatorFn = (c: AbstractControl): ValidationErrors | null => {
  let d = String(c.value ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2);
  if (/^0?[67]\d{8}$/.test(d)) return null;
  return /^255[67]\d{8}$/.test(d) || /^(254|256|250|257)[17]\d{8}$/.test(d) ? null : { phone: true };
};

export function isStrongPassword(v: string | null | undefined): boolean {
  return !strongPassword({ value: v } as AbstractControl);
}
