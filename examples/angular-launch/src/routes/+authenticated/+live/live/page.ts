import { Component, computed } from "@angular/core";
import { injectRoute } from "./route.generated";
import { injectRpc } from "./rpc.generated";

@Component({
  selector: "launch-live",
  template: `
    <h1>Live todos</h1>
    <ul id="live-list">
      @for (todo of todos.value(); track todo.id) {
        <li>{{ todo.title }}</li>
      }
    </ul>
    <p id="live-status" role="status">{{ status() }}</p>

    <form (submit)="add($event, title)">
      <label for="live-title">Title</label>
      <input #title id="live-title" required maxlength="200" autocomplete="off" />
      <button type="submit" [disabled]="adding.status() !== 'open'">Add over the channel</button>
    </form>
    <p id="live-channel" role="status">{{ channel() }}</p>
    @if (adding.status() === "failed" || adding.status() === "ended") {
      <button id="live-reconnect" type="button" (click)="adding.reconnect()">Reconnect</button>
    }
  `,
})
export default class Live {
  readonly #rpc = injectRpc();
  readonly #route = injectRoute();
  // The server renders the resolver's list; after hydration the stream follows it.
  protected readonly todos = this.#rpc.live.watch.connect({
    initial: () => this.#route.data().todos,
  });
  // A channel: the list first, then again after each title it adds.
  protected readonly adding = this.#rpc.live.add.connect({ initial: () => null });
  protected readonly status = computed(() => {
    const status = this.todos.status();

    if (status === "open") {
      return "Live";
    }

    if (status === "failed" || status === "ended") {
      return "Lost the live list. Refresh to try again.";
    }

    return "";
  });
  protected readonly channel = computed(() => {
    const status = this.adding.status();
    const todos = this.adding.value();

    if (status === "failed" || status === "ended") {
      return "The add channel closed.";
    }

    if (status !== "open") {
      return "";
    }

    if (todos === null) {
      return "Add channel open.";
    }

    return `Add channel open: the server has ${todos.length} todos.`;
  });

  protected async add(event: SubmitEvent, input: HTMLInputElement): Promise<void> {
    event.preventDefault();

    const title = input.value.trim();

    // The server refuses other titles, and a refused message closes the channel.
    if (title.length === 0 || title.length > 200) {
      return;
    }

    try {
      await this.adding.send({ title });
      input.value = "";
    } catch {
      // The channel's status already says it closed.
    }
  }
}
