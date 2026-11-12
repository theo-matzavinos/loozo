import { Component, input, signal } from "@angular/core";
import type { Todo } from "../../todos.server.js";
import { injectRpc } from "./rpc.generated.js";

@Component({
  selector: "app-todo-item",
  template: `
    <span>{{ todo().title }}</span>
    <button type="button" (click)="complete()">Complete</button>
    <p role="status">{{ status() }}</p>
  `,
})
export class TodoItem {
  readonly #rpc = injectRpc();
  readonly todo = input.required<Todo>();
  readonly status = signal("");

  async complete(): Promise<void> {
    try {
      await this.#rpc.todos.complete({ id: this.todo().id });
      this.status.set("Completed");
    } catch (error) {
      if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists.");

        return;
      }

      this.status.set("Could not complete the todo.");
    }
  }
}
