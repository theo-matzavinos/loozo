import { serializeCookie, type CookieOptions } from "../cookies.js";

/**
 * The response effects of one call: cookies and headers, as `response` in middleware and
 * handler arguments.
 *
 * @remarks
 * Over HTTP, cookies and headers go on the RPC response for every outcome, failures
 * included. Launch's own headers (`Content-Type`, `Cache-Control`, `Vary`,
 * `X-Content-Type-Options`, and a stream's `X-Accel-Buffering`) replace the same headers
 * set here, and the status can't be set.
 *
 * During server rendering, cookies go on the page response, a redirect included, and
 * headers are dropped: a page's headers mustn't depend on which queries it ran. Angular
 * copies the page's headers once the app is first stable, so the cookies of a call that
 * settles later, such as one awaited in a `BEFORE_APP_SERIALIZED` hook, are lost. A page
 * Angular prerenders has no response, so a cookie set before the app is first stable fails
 * the build.
 *
 * The effects are sent once the call settled, or, for a stream, once its handler returned
 * its iterable. After that, setting a cookie throws, and header changes are ignored. So a
 * stream sets its cookies in a stage, in middleware before `next()`, or in a handler that isn't a
 * generator, before it returns its iterable: an `async function*` handler's body runs
 * after its response started.
 *
 * Its members are function properties, so destructuring them is safe.
 */
export interface ResponseControl {
  /**
   * Headers for the RPC response. Ignored during server rendering.
   *
   * @remarks
   * Use {@link ResponseControl.setCookie} for cookies: a `Set-Cookie` header written here
   * is dropped during server rendering like any other header.
   */
  readonly headers: Headers;
  /**
   * Sets a cookie on the response.
   *
   * @param name - The cookie name: an HTTP token.
   * @param value - The cookie value, already encoded: printable ASCII without spaces,
   * `"`, `,`, `;` or `\`.
   * @param options - The cookie's attributes.
   * @throws TypeError for an invalid name, value or attribute, or `"none"` same-site
   * without `secure`; Error after the response was sent.
   */
  readonly setCookie: (name: string, value: string, options?: CookieOptions) => void;
  /**
   * Deletes a cookie by setting it expired.
   *
   * @remarks
   * Pass the path, domain and security attributes the cookie was set with, or the browser
   * keeps it.
   *
   * @param name - The cookie name.
   * @param options - The attributes the cookie was set with.
   * @throws As {@link ResponseControl.setCookie}.
   */
  readonly deleteCookie: (
    name: string,
    options?: Omit<CookieOptions, "maxAge" | "expires">,
  ) => void;
}

/**
 * The response effects one call collects. Internal.
 *
 * @remarks
 * The transport that created them passes `control` to `runProcedure`, calls `commit` when it
 * produces the response, and reads `cookies` and `headers` then.
 */
export interface ResponseEffects {
  /** The view middleware and handlers receive as `response`. */
  readonly control: ResponseControl;
  /** The serialized `Set-Cookie` values, in order. */
  readonly cookies: readonly string[];
  /** The headers set through `control`. */
  readonly headers: Headers;
  /** Marks the response as sent: setting a cookie throws from now on. */
  commit(): void;
}

/**
 * Creates the response effects for one call. Internal.
 *
 * @returns Effects with no cookies or headers.
 */
export function createResponseEffects(): ResponseEffects {
  const cookies: string[] = [];
  const headers = new Headers();
  let committed = false;

  function add(cookie: string): void {
    if (committed) {
      throw new Error(
        "Launch already sent this call's response; a stream sets cookies in middleware " +
          "before next(), or in its handler before it returns its iterable",
      );
    }

    cookies.push(cookie);
  }

  return {
    control: {
      headers,
      setCookie(name, value, options = {}) {
        add(serializeCookie(name, value, options));
      },
      deleteCookie(name, options = {}) {
        add(serializeCookie(name, "", { ...options, maxAge: 0, expires: new Date(0) }));
      },
    },
    cookies,
    headers,
    commit() {
      committed = true;
    },
  };
}
