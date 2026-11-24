import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { ApiProblem } from './models';

export const API = environment.apiUrl;

/** Normalises any HTTP error into the backend's RFC 7807 problem shape. */
export function toProblem(err: unknown): ApiProblem {
  if (err instanceof HttpErrorResponse) {
    const body = err.error && typeof err.error === 'object' ? err.error : {};
    // Never surface Angular's raw "Http failure response for ..." text: map non-API failures to a code instead.
    const fallbackCode = err.status === 0 ? 'NETWORK' : err.status >= 500 ? 'SERVER_ERROR' : err.status === 403 ? 'FORBIDDEN' : undefined;
    return { status: err.status, code: body.code ?? fallbackCode, detail: body.code || body.detail ? body.detail : undefined, errors: body.errors };
  }
  return { status: 0, detail: String(err) };
}

export function absoluteUrl(path: string): string {
  return path.startsWith('http') ? path : `${location.origin}${path}`;
}
