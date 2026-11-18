import { Component, afterNextRender, signal } from "@angular/core";
import { RpcRedirect } from "@loozo/angular-launch";
import { injectRoute } from "./route.generated";

function caught(error: unknown): string {
  return error instanceof RpcRedirect ? error.to : `not a redirect: ${String(error)}`;
}

// Opens a stream and a channel in the browser and shows each one's caught redirect.
@Component({
  template: `
    <h1 id="page" data-id="+authenticated/live">Live</h1>
    <p>
      stream <code id="stream">{{ stream() }}</code>
    </p>
    <p>
      channel <code id="channel">{{ channel() }}</code>
    </p>
  `,
})
export default class Live {
  readonly #route = injectRoute();
  protected readonly stream = signal("");
  protected readonly channel = signal("");

  constructor() {
    afterNextRender(async () => {
      try {
        for await (const value of this.#route.remote.session.ticks()) {
          this.stream.set(`value: ${String(value)}`);
        }
      } catch (error) {
        this.stream.set(caught(error));
      }

      try {
        for await (const value of this.#route.remote.session.echo()) {
          this.channel.set(`value: ${value}`);
        }
      } catch (error) {
        this.channel.set(caught(error));
      }
    });
  }
}
