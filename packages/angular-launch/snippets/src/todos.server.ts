// An in-memory store standing in for your database.
export interface Todo {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

const rows = new Map<string, Todo[]>([
  ["alice", [{ id: "1", title: "Buy milk", completed: false }]],
]);

export const todos = {
  async listForUser(user: string): Promise<readonly Todo[]> {
    return rows.get(user) ?? [];
  },
  async completeForUser(user: string, id: string): Promise<Todo | null> {
    const list = rows.get(user) ?? [];
    const index = list.findIndex((todo) => todo.id === id);

    if (index === -1) {
      return null;
    }

    const completed = { ...list[index], completed: true };

    rows.set(user, list.with(index, completed));

    return completed;
  },
};
