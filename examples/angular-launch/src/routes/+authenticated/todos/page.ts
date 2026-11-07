import { Component, computed, signal } from "@angular/core";
import { injectMutation, injectQuery, type QueryClient } from "@tanstack/angular-query";
import type { Client } from "@loozo/angular-launch";
import type todos from "./rpc";
import { injectQueries, injectRpc } from "./rpc.generated";

type Todo = Awaited<ReturnType<Client<typeof todos>["list"]>>["todos"][number];

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
                [attr.aria-label]="'Complete ' + todo.title"
                (click)="complete(todo.id)"
              >
                Complete
              </button>
            }
            <button
              type="button"
              [attr.aria-label]="'Delete ' + todo.title"
              (click)="remove(todo.id)"
            >
              Delete
            </button>
          </li>
        }
      </ul>
      @if (todos.isError()) {
        <p id="list-stale">Could not read the list again. Refresh to check it.</p>
      }
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
  readonly todos = injectQuery(() => this.#queries.todos.list.queryOptions());
  readonly #add = injectMutation(() =>
    this.#queries.todos.add.mutationOptions({
      onSuccess: () => {
        this.title.set("");
      },
    }),
  );
  // Optimistic writes: each changes the cached list at once and undoes its own row if it
  // fails. config.ts reads the list again after the last pending write. The shared scope sends
  // the writes to the server one at a time, in order.
  readonly #complete = injectMutation(() =>
    this.#queries.todos.complete.mutationOptions({
      scope: { id: "todos" },
      onMutate: async ({ id }, { client }) => {
        const key = this.#queries.todos.list.key();

        await client.cancelQueries({ queryKey: key });

        const before = client.getQueryData(key)?.todos.find((todo) => todo.id === id);

        if (before !== undefined) {
          this.#replaceTodo(client, { ...before, completed: true });
        }

        return { before };
      },
      onError: (error, { id }, result, { client }) => {
        // The server says it's gone: show that instead of the row as it was.
        if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
          this.#updateTodos(client, (todos) => todos.filter((todo) => todo.id !== id));

          return;
        }

        const before = result?.before;

        if (before !== undefined) {
          this.#replaceTodo(client, before);
        }
      },
    }),
  );
  readonly #remove = injectMutation(() =>
    this.#queries.todos.remove.mutationOptions({
      scope: { id: "todos" },
      onMutate: async ({ id }, { client }) => {
        const key = this.#queries.todos.list.key();

        await client.cancelQueries({ queryKey: key });

        const todos = client.getQueryData(key)?.todos ?? [];
        const index = todos.findIndex((todo) => todo.id === id);

        if (index === -1) {
          return undefined;
        }

        this.#updateTodos(client, (current) => current.filter((todo) => todo.id !== id));

        return { removed: todos[index], index };
      },
      onError: (error, _input, result, { client }) => {
        // Already gone: nothing to put back.
        if (this.#rpc.todos.remove.isError(error) && error.code === "NOT_FOUND") {
          return;
        }

        if (result === undefined) {
          return;
        }

        const { removed, index } = result;

        this.#updateTodos(client, (todos) =>
          todos.toSpliced(Math.min(index, todos.length), 0, removed),
        );
      },
    }),
  );
  readonly #refreshing = signal(false);
  readonly pending = computed(() => this.#add.isPending() || this.#refreshing());
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
    try {
      await this.#complete.mutateAsync({ id });
      this.status.set("Todo completed");
    } catch (error) {
      if (this.#rpc.todos.complete.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists.");
      } else {
        this.status.set("Could not complete todo. Try again.");
      }
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.#remove.mutateAsync({ id });
      this.status.set("Todo deleted");
    } catch (error) {
      if (this.#rpc.todos.remove.isError(error) && error.code === "NOT_FOUND") {
        this.status.set("This todo no longer exists.");
      } else {
        this.status.set("Could not delete todo. Try again.");
      }
    }
  }

  // Changes the cached list's todos; does nothing while the list hasn't loaded.
  #updateTodos(client: QueryClient, update: (todos: readonly Todo[]) => Todo[]): void {
    client.setQueryData(this.#queries.todos.list.key(), (list) => {
      if (list === undefined) {
        return list;
      }

      return { ...list, todos: update(list.todos) };
    });
  }

  #replaceTodo(client: QueryClient, replacement: Todo): void {
    this.#updateTodos(client, (todos) =>
      todos.map((todo) => {
        if (todo.id === replacement.id) {
          return replacement;
        }

        return todo;
      }),
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
