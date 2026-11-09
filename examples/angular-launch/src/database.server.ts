export const serverOnlySentinel = "LAUNCH_SERVER_ONLY_DATABASE_SENTINEL";
export const stats = {
  contexts: 0,
  directQueries: 0,
  httpQueries: 0,
  signedInChecks: 0,
  finishedQueries: 0,
  abortedQueries: 0,
  addCalls: 0,
  completeCalls: 0,
  removeCalls: 0,
  writes: 0,
  streamsStarted: 0,
  streamsAborted: 0,
  streamsReturned: 0,
  channelsStarted: 0,
  channelsAborted: 0,
  channelsReturned: 0,
};

// Called whenever a user's todos change, for the live list.
const listeners = new Map<string, Set<() => void>>();

function changed(user: string): void {
  for (const listener of listeners.get(user) ?? []) {
    listener();
  }
}

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const rows = new Map<string, Todo[]>();

function todosForUser(user: string): Todo[] {
  let todos = rows.get(user);

  if (!todos) {
    todos = [{ id: `${user}-initial`, title: `${user}: Review todos`, completed: false }];
    rows.set(user, todos);
  }

  return todos;
}

export const db = {
  todos: {
    async listForUser(user: string, delayed: boolean) {
      let delay = 30;

      if (delayed) {
        delay = 600;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      stats.finishedQueries += 1;

      return todosForUser(user);
    },
    async addForUser(user: string, title: string): Promise<Todo> {
      stats.addCalls += 1;

      const todo = { id: crypto.randomUUID(), title, completed: false };

      todosForUser(user).push(todo);
      stats.writes += 1;
      changed(user);

      return todo;
    },
    async snapshotForUser(user: string): Promise<Todo[]> {
      return todosForUser(user).map((todo) => ({ ...todo }));
    },
    // Yields the user's todos now and after every change, until `signal` aborts.
    async *watchForUser(user: string, signal: AbortSignal): AsyncGenerator<Todo[], void> {
      let wake: (() => void) | undefined;
      const notify = () => wake?.();
      let own = listeners.get(user);

      if (!own) {
        own = new Set();
        listeners.set(user, own);
      }

      own.add(notify);
      signal.addEventListener("abort", notify);

      try {
        while (!signal.aborted) {
          const next = new Promise<void>((resolve) => {
            wake = resolve;
          });

          yield todosForUser(user).map((todo) => ({ ...todo }));
          await next;
        }
      } finally {
        own.delete(notify);
        signal.removeEventListener("abort", notify);
      }
    },
    async findForUser(user: string, id: string): Promise<Todo | null> {
      for (const todo of todosForUser(user)) {
        if (todo.id === id) {
          return { ...todo };
        }
      }

      return null;
    },
    async completeForUser(user: string, id: string): Promise<Todo | null> {
      stats.completeCalls += 1;

      for (const todo of todosForUser(user)) {
        if (todo.id !== id) {
          continue;
        }

        if (!todo.completed) {
          todo.completed = true;
          stats.writes += 1;
          changed(user);
        }

        return todo;
      }

      return null;
    },
    async removeForUser(user: string, id: string): Promise<boolean> {
      stats.removeCalls += 1;

      const todos = todosForUser(user);
      const index = todos.findIndex((todo) => todo.id === id);

      if (index === -1) {
        return false;
      }

      todos.splice(index, 1);
      stats.writes += 1;
      changed(user);

      return true;
    },
  },
};
