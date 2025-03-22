import { isPlatformBrowser } from '@angular/common';
import { inject, PLATFORM_ID, REQUEST, RESPONSE_INIT } from '@angular/core';
import { parse, serialize } from 'cookie';

export function getCookie(name: string): string | undefined {
  let cookieHeader: string;

  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    cookieHeader = document.cookie;
  } else {
    const request = inject(REQUEST);

    cookieHeader = request?.headers.get('Cookie') ?? '';
  }

  const cookies = parse(cookieHeader);

  return cookies[name];
}

export function injectSetCookie() {
  const isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  const request = inject(REQUEST, { optional: true });
  const response = inject(RESPONSE_INIT, { optional: true });

  return (...args: Parameters<typeof serialize>) => {
    if (isBrowser) {
      document.cookie = serialize(...args);
    }

    if (!request) {
      return;
    }

    const cookie = serialize(...args);

    request.headers.set(
      'Cookie',
      `${request.headers.get('Cookie')}; ${cookie}`,
    );

    if (!response) {
      return;
    }

    const responseHeaders = new Headers(response.headers);

    responseHeaders.append('Set-Cookie', cookie);
    response.headers = responseHeaders;
  };
}
