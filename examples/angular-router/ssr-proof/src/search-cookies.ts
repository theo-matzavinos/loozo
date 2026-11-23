import { DOCUMENT, isPlatformBrowser } from "@angular/common";
import { PLATFORM_ID, REQUEST, RESPONSE_INIT, inject } from "@angular/core";
import type { SearchStorage } from "@loozo/angular-router";

// Readable by document.cookie, so no HttpOnly. Drop Secure for plain-HTTP hosts other than localhost.
const attributes = "Path=/; Max-Age=31536000; SameSite=Lax; Secure";

/** Remembered search values in cookies: the browser's jar, or the server's request and response. */
export function cookieSearchStorage(): SearchStorage {
  if (isPlatformBrowser(inject(PLATFORM_ID))) {
    const document = inject(DOCUMENT);

    return {
      read: (id) => cookies(document.cookie).get(`search.${id}`),
      write: (id, text) => {
        if (cookies(document.cookie).get(`search.${id}`) !== text) {
          document.cookie = `search.${id}=${text}; ${attributes}`;
        }
      },
      forget: (id) => {
        if (cookies(document.cookie).has(`search.${id}`)) {
          document.cookie = `search.${id}=; Path=/; Max-Age=0`;
        }
      },
    };
  }

  // Null while prerendering or extracting routes.
  const request = inject(REQUEST);
  const response = inject(RESPONSE_INIT);
  // What this response leaves in the browser: the request's cookies, then every write and forget.
  const effective = cookies(request?.headers.get("cookie") ?? "");

  function append(value: string): void {
    if (!response) {
      return;
    }

    // Angular builds the response, and its redirects, from these headers: keep the object.
    let headers = response.headers;

    if (!(headers instanceof Headers)) {
      headers = new Headers(headers);
      response.headers = headers;
    }

    headers.append("Set-Cookie", value);
  }

  return {
    read: (id) => effective.get(`search.${id}`),
    write: (id, text) => {
      if (effective.get(`search.${id}`) !== text) {
        effective.set(`search.${id}`, text);
        append(`search.${id}=${text}; ${attributes}`);
      }
    },
    forget: (id) => {
      if (effective.delete(`search.${id}`)) {
        append(`search.${id}=; Path=/; Max-Age=0`);
      }
    },
  };
}

// A Cookie header's or document.cookie's pairs; the first occurrence of each name wins.
function cookies(header: string): Map<string, string> {
  const result = new Map<string, string>();

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = pair.slice(0, separator).trim();

    if (!result.has(name)) {
      result.set(name, pair.slice(separator + 1).trim());
    }
  }

  return result;
}
