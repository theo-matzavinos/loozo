import { isPlatformBrowser } from "@angular/common";
import { HttpErrorResponse, type HttpInterceptorFn } from "@angular/common/http";
import { inject, PLATFORM_ID } from "@angular/core";
import { tap } from "rxjs";

declare global {
  // The redirect bodies this page's interceptor saw, in order.
  var proofWire: unknown[] | undefined;
}

// Records every 303 body an interceptor sees: on the page in the browser, in the server log
// while rendering, so the proof can show interceptors get the wire frame, words included.
export const recordRedirects: HttpInterceptorFn = (request, next) => {
  const browser = isPlatformBrowser(inject(PLATFORM_ID));

  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (!(error instanceof HttpErrorResponse) || error.status !== 303) {
          return;
        }

        if (browser) {
          (globalThis.proofWire ??= []).push(error.error);
        } else {
          console.log(`PROOF_WIRE ${JSON.stringify(error.error)}`);
        }
      },
    }),
  );
};
