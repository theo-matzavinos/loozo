import { Component, input, signal } from "@angular/core";
import type { Todo } from "../../todos.server.js";
import { injectRoute } from "./route.generated.js";

@Component({
  selector: "app-todo-item",
  template: `
    <span>{{ todo().title }}</span>
    <button type="button" (click)="complete()">Complete</button>
    <p role="status">{{ status() }}</p>
  `,
})
export class TodoItem {
  readonly #route = injectRoute();
  readonly todo = input.required<Todo>();
  readonly status = signal("");

  async complete(): Promise<void> {
    const { complete } = this.#route.remote.todos;

    try {
      await complete({ id: this.todo().id });
      this.status.set("Completed");
    } catch (error) {
      if (complete.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists.");

        return;
      }

      this.status.set("Could not complete the todo.");
    }
  }
}
