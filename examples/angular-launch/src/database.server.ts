export const serverOnlySentinel = "LAUNCH_SERVER_ONLY_DATABASE_SENTINEL";
export const stats = {
  contexts: 0,
  directQueries: 0,
  httpQueries: 0,
  groupGuards: 0,
  finishedQueries: 0,
  addCalls: 0,
  completeCalls: 0,
  writes: 0,
};

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

      return todo;
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
        }

        return todo;
      }

      return null;
    },
  },
};
