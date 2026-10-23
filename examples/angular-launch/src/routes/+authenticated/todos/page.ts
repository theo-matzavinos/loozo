import { Component, computed, inject, signal } from "@angular/core";
import { injectMutation, injectQuery, QueryClient } from "@tanstack/angular-query";
import { injectQueries, injectRpc } from "./rpc.generated";

@Component({
  selector: "launch-todos",
  template: `
    <h1>Personal todos</h1>
    @let model = todos.data();
    @if (model) {
      <p id="identity">{{ model.user }} · request {{ model.requestId }}</p>
    }
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
    @if (model) {
      <ul id="todo-list">
        @for (todo of model.todos; track todo.id) {
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
    } @else if (todos.isError()) {
      <p id="list-error">Could not load todos. Refresh to try again.</p>
    } @else {
      <p id="list-pending">Loading todos…</p>
    }
    <button type="button" id="refresh" [disabled]="pending()" (click)="refresh()">Refresh</button>
    <p id="status" role="status" aria-live="polite">{{ status() }}</p>
  `,
})
export default class Todos {
  readonly #rpc = injectRpc();
  readonly #queries = injectQueries();
  readonly #client = inject(QueryClient);
  readonly todos = injectQuery(() => this.#queries.todos.list.queryOptions());
  // Returning the invalidation keeps the mutation pending until the list is read again.
  // throwOnError fails the mutation when that read fails, so the page doesn't report
  // success next to a stale list.
  readonly #add = injectMutation(() =>
    this.#queries.todos.add.mutationOptions({
      onSuccess: () => {
        // The write succeeded: clear the title even if the list can't be read again.
        this.title.set("");

        return this.#invalidateTodos();
      },
    }),
  );
  readonly #complete = injectMutation(() =>
    this.#queries.todos.complete.mutationOptions({
      onSuccess: () => this.#invalidateTodos(),
    }),
  );
  readonly #refreshing = signal(false);
  readonly pending = computed(
    () => this.#add.isPending() || this.#complete.isPending() || this.#refreshing(),
  );
  readonly title = signal("");
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

    this.status.set("Adding todo…");

    try {
      await this.#add.mutateAsync({ title: this.title() });
      this.status.set("Todo added");
    } catch (error) {
      if (this.#rpc.todos.add.isError(error) && error.code === "INVALID_INPUT") {
        this.status.set("Enter a title with 1–200 characters.");
      } else {
        this.status.set("Could not add todo. Refresh to check before retrying.");
      }
    }
  }

  async complete(id: string): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.status.set("Completing todo…");

    try {
      await this.#complete.mutateAsync({ id });
      this.status.set("Todo completed");
    } catch (error) {
      if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists. Refresh the list.");
      } else {
        this.status.set("Could not complete todo. Refresh to check before retrying.");
      }
    }
  }

  #invalidateTodos(): Promise<void> {
    return this.#client.invalidateQueries(
      { queryKey: this.#queries.todos.$key() },
      { throwOnError: true },
    );
  }

  async refresh(): Promise<void> {
    if (this.pending()) {
      return;
    }

    this.#refreshing.set(true);
    this.status.set("Refreshing…");

    const result = await this.todos.refetch();

    this.#refreshing.set(false);

    if (result.isError) {
      this.status.set("Could not refresh. Try again.");

      return;
    }

    this.status.set("refreshed");
  }
}
