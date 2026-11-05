import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  linkedSignal,
  signal,
} from "@angular/core";
import { injectRoute } from "./route.generated";
import { injectRpc } from "./rpc.generated";

declare global {
  // Loopback proof fixture: how many lists the stream delivered.
  var __liveUpdates: number | undefined;
}

@Component({
  selector: "launch-live",
  template: `
    <h1>Live todos</h1>
    <ul id="live-list">
      @for (todo of todos(); track todo.id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
    <p id="live-status" role="status">{{ status() }}</p>
  `,
})
export default class Live {
  readonly #rpc = injectRpc();
  readonly #route = injectRoute();
  readonly #stop = new AbortController();
  protected readonly todos = linkedSignal(() => this.#route.data().todos);
  protected readonly status = signal("");

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#stop.abort());
    // Streams don't run during server rendering; follow the list once in the browser.
    afterNextRender(() => void this.#follow());
  }

  async #follow(): Promise<void> {
    globalThis.__liveUpdates = 0;

    try {
      for await (const todos of this.#rpc.live.watch({ signal: this.#stop.signal })) {
        globalThis.__liveUpdates += 1;
        this.todos.set(todos);
        this.status.set("Live");
      }
    } catch (error) {
      if (this.#stop.signal.aborted) {
        return;
      }

      this.status.set("Lost the live list. Refresh to try again.");
    }
  }
}
