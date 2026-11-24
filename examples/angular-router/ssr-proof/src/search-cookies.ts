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
  let varied = false;

  // Angular builds the response, and its redirects, from these headers: keep the object.
  function headers(): Headers | undefined {
    if (!response) {
      return undefined;
    }

    if (!(response.headers instanceof Headers)) {
      response.headers = new Headers(response.headers);
    }

    return response.headers;
  }

  // A page that uses remembered values answers each visitor's cookies: a redirect, the fallback
  // page or a Set-Cookie. Keep shared caches from reusing it for another visitor.
  function use(): Map<string, string> {
    if (!varied) {
      varied = true;
      headers()?.append("Vary", "Cookie");
    }

    return effective;
  }

  return {
    read: (id) => use().get(`search.${id}`),
    write: (id, text) => {
      if (use().get(`search.${id}`) !== text) {
        effective.set(`search.${id}`, text);
        headers()?.append("Set-Cookie", `search.${id}=${text}; ${attributes}`);
      }
    },
    forget: (id) => {
      if (use().delete(`search.${id}`)) {
        headers()?.append("Set-Cookie", `search.${id}=; Path=/; Max-Age=0`);
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
