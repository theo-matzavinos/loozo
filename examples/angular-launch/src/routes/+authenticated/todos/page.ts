import { Component, inject, signal } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { injectRpc } from "./rpc.generated";
import type group from "./rpc";
import type { Client } from "@loozo/angular-launch";

type Snapshot = Awaited<ReturnType<Client<typeof group>["list"]>>;
@Component({
  selector: "launch-todos",
  template: `
    <h1>Personal todos</h1>
    <p id="identity">{{ model().user }} · request {{ model().requestId }}</p>
    <form (submit)="add($event)">
      <label for="todo-title">New todo</label>
      <div class="todo-entry">
        <input
          id="todo-title"
          name="title"
          type="text"
          required
          maxlength="200"
          [value]="title()"
          (input)="editTitle($event)"
          [disabled]="pending()"
          aria-describedby="status"
        />
        <button type="submit" id="add" [disabled]="pending()">Add</button>
      </div>
    </form>
    <ul id="todo-list">
      @for (todo of model().todos; track todo.id) {
        <li [attr.data-todo-id]="todo.id">
          <span>{{ todo.title }}</span>
          @if (todo.completed) {
            <span class="completed">Completed</span>
          } @else {
            <button
              type="button"
              [disabled]="pending()"
              [attr.aria-label]="'Complete ' + todo.title"
              (click)="complete(todo.id)"
            >
              Complete
            </button>
          }
        </li>
      }
    </ul>
    <button type="button" id="refresh" [disabled]="pending()" (click)="refresh()">Refresh</button>
    <p id="status" role="status" aria-live="polite">{{ status() }}</p>
  `,
})
export default class Todos {
  readonly #rpc = injectRpc();
  readonly model = signal<Snapshot>(inject(ActivatedRoute).snapshot.data["todos"]);
  readonly title = signal("");
  readonly pending = signal(false);
  readonly status = signal("ready");

  editTitle(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.title.set(event.target.value);
    }
  }

  async add(event: Event): Promise<void> {
    event.preventDefault();

    if (this.pending()) {
      return;
    }

    this.pending.set(true);
    this.status.set("Adding todo…");

    try {
      await this.#rpc.todos.add({ title: this.title() });
      this.title.set("");
      this.model.set(await this.#rpc.todos.list());
      this.status.set("Todo added");
    } catch (error) {
      if (this.#rpc.todos.add.isError(error) && error.code === "INVALID_INPUT") {
        this.status.set("Enter a title with 1–200 characters.");
      } else {
        this.status.set("Could not add todo. Refresh to check before retrying.");
      }
    } finally {
      this.pending.set(false);
    }
  }

  async complete(id: string): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.pending.set(true);
    this.status.set("Completing todo…");

    try {
      await this.#rpc.todos.complete({ id });
      this.model.set(await this.#rpc.todos.list());
      this.status.set("Todo completed");
    } catch (error) {
      if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists. Refresh the list.");
      } else {
        this.status.set("Could not complete todo. Refresh to check before retrying.");
      }
    } finally {
      this.pending.set(false);
    }
  }

  async refresh(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.pending.set(true);
    this.status.set("Refreshing…");

    try {
      this.model.set(await this.#rpc.todos.list());
      this.status.set("refreshed");
    } catch {
      this.status.set("Could not refresh. Try again.");
    } finally {
      this.pending.set(false);
    }
  }
}
