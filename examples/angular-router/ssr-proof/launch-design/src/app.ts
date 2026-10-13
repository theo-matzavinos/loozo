import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute, RouterOutlet } from "@angular/router";
import { injectRpc } from "./rpc.generated";
import { RpcError } from "./wire";
import type { ListResult } from "./wire";

@Component({
  selector: "proof-todos",
  template: `
    <h1>Launch todo proof</h1>
    @if (model(); as snapshot) {
      <p id="identity">{{ snapshot.user }} · request {{ snapshot.requestId }}</p>
      <ul id="todo-list">
        @for (todo of snapshot.todos; track todo.id) {
          <li [attr.data-id]="todo.id">{{ todo.title }} · {{ todo.completed }}</li>
        }
      </ul>
    }
    <div>
      <button type="button" id="refresh" (click)="refresh()">Refresh</button>
      <button type="button" id="add" (click)="add()">Add todo</button>
      <button type="button" id="complete" (click)="complete()">Complete first</button>
      <button type="button" id="missing" (click)="missing()">Missing todo</button>
      <button type="button" id="cancel" (click)="cancel()">Cancel slow query</button>
    </div>
    <p id="status" aria-live="polite">{{ status() }}</p>
  `,
})
export class Todos {
  readonly #rpc = injectRpc();
  readonly #route = inject(ActivatedRoute);
  readonly model = signal<ListResult | undefined>(this.#route.snapshot.data["todos"]);
  readonly status = signal<string>(this.#route.snapshot.data["probe"] ?? "ready");

  async refresh(): Promise<void> {
    const model = await this.#rpc.todos.list();

    this.model.set(model);
    this.status.set("refreshed");
  }

  async add(): Promise<void> {
    await this.#rpc.todos.add("  Browser todo  ");
    await this.refresh();
    this.status.set("added");
  }

  async complete(): Promise<void> {
    await this.#rpc.todos.complete({ id: "1" });
    await this.refresh();
    this.status.set("completed");
  }

  async missing(): Promise<void> {
    try {
      await this.#rpc.todos.complete({ id: "missing" });
    } catch (error) {
      if (error instanceof RpcError && error.code === "NOT_FOUND") {
        this.status.set(`NOT_FOUND:${error.data?.id}`);

        return;
      }

      throw error;
    }
  }

  async cancel(): Promise<void> {
    const controller = new AbortController();
    const pending = this.#rpc.todos.slow({ signal: controller.signal });

    setTimeout(() => controller.abort(), 100);

    try {
      await pending;
      this.status.set("unexpected success");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        this.status.set("AbortError");

        return;
      }

      throw error;
    }
  }
}

@Component({
  selector: "proof-static",
  template: `<h1 id="static-title">Static page without RPC</h1>`,
})
export class StaticPage {}

@Component({ selector: "proof-root", imports: [RouterOutlet], template: `<router-outlet />` })
export class App {}
