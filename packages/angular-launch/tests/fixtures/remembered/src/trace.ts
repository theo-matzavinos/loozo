import { inject, Injectable, RESPONSE_INIT } from "@angular/core";

export interface TraceEntry {
  readonly kind: string;
  readonly url: string;
  readonly detail?: string | number;
}

// The app's navigation trace: router events and every call of the navigation error handler.
// On the server each render sends its whole trace as the x-proof-trace response header.
@Injectable({ providedIn: "root" })
export class Trace {
  readonly entries: TraceEntry[] = [];
  readonly #response = inject(RESPONSE_INIT);

  add(entry: TraceEntry): void {
    this.entries.push(entry);

    if (this.#response === null) {
      return;
    }

    // Keep one Headers object, as Launch's searchCookies() does, so cookies already added stay.
    if (!(this.#response.headers instanceof Headers)) {
      this.#response.headers = new Headers(this.#response.headers);
    }

    this.#response.headers.set("x-proof-trace", JSON.stringify(this.entries));
  }
}
