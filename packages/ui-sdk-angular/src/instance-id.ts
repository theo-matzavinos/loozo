import { isPlatformServer } from "@angular/common";
import { APP_ID, ElementRef, PLATFORM_ID, Service, inject } from "@angular/core";

/** Angular's default `APP_ID`, which keeps the bare `ui-sdk-` prefix. */
const defaultAppId = "ng";

/** The next instance number in this application, and the prefix its ids carry. */
@Service()
class UiSdkIds {
  readonly server = isPlatformServer(inject(PLATFORM_ID));
  readonly prefix = idPrefix(inject(APP_ID));
  #next = 0;

  next(): number {
    const allocated = this.#next;

    this.#next += 1;

    return allocated;
  }
}

function idPrefix(appId: string): string {
  if (appId === defaultAppId) {
    return "ui-sdk-";
  }

  return `ui-sdk-${appId}-`;
}

/**
 * Allocates a core instance id that survives hydration: `ui-sdk-s<n>` on the server, the
 * server-rendered `data-ui-sdk-id` while hydrating, and `ui-sdk-<n>` for a root the browser
 * creates. The root renders it as `data-ui-sdk-id`. Call it once, from a root directive.
 */
export function ɵinjectInstanceId(): string {
  const ids = inject(UiSdkIds);

  if (ids.server) {
    return `${ids.prefix}s${ids.next()}`;
  }

  const host: unknown = inject(ElementRef).nativeElement;

  if (host instanceof Element) {
    const rendered = host.getAttribute("data-ui-sdk-id");

    if (rendered !== null && rendered !== "") {
      return rendered;
    }
  }

  return `${ids.prefix}${ids.next()}`;
}
