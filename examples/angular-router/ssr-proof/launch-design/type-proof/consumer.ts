import { mutation, query } from "@loozo/angular-launch/server";
import { injectRpc } from "./rpc.generated";
import { idSchema } from "./schemas";

const rpc = injectRpc();
const controller = new AbortController();
const list: Promise<{ id: string; title: string; completed: boolean; owner: string }[]> =
  rpc.todos.list({ signal: controller.signal });
const add: Promise<{ id: string; title: string; completed: boolean }> =
  rpc.todos.add("  Buy milk  ");
const complete: Promise<{ id: string; title: string; completed: boolean }> = rpc.todos.complete(
  { id: "1" },
  { signal: controller.signal },
);
const queryKind: "query" = rpc.todos.list.kind;
const mutationKind: "mutation" = rpc.todos.add.kind;

void [list, add, complete, queryKind, mutationKind];

// @ts-expect-error Caller supplies schema INPUT, not transformed handler output.
rpc.todos.add({ title: "Buy milk" });
// @ts-expect-error Unknown scope is unavailable.
rpc.settings.get();
// @ts-expect-error Input is required.
rpc.todos.complete();
// @ts-expect-error Wrong input type.
rpc.todos.complete({ id: 1 });
// @ts-expect-error Options never replace required input.
rpc.todos.complete({ signal: controller.signal });

function inspectFailure(error: unknown) {
  if (!rpc.todos.complete.isError(error)) {
    throw error;
  }

  if (error.code === "NOT_FOUND") {
    const id: string = error.data.id;

    void id;
    // @ts-expect-error Declared error data has no title.
    void error.data.title;
  }

  if (error.code === "INVALID_INPUT") {
    const message: string = error.issues[0].message;

    void message;
  }
}

void inspectFailure;

query({
  handler: ({ context, input }) => {
    const request: Request = context.request;
    const noInput: undefined = input;

    void [request, noInput];
    // @ts-expect-error Context comes from the registered factory, not any.
    void context.missing;

    return null;
  },
});

mutation({
  input: idSchema,
  errors: { NOT_FOUND: { status: 404, message: "Missing", data: idSchema } },
  handler: ({ errors }) => {
    // @ts-expect-error Undeclared public error.
    errors.CONFLICT({ id: "1" });
    // @ts-expect-error Error data is schema-typed.
    errors.NOT_FOUND({ id: 1 });

    return null;
  },
});

// @ts-expect-error Non-JSON result must not advertise a Date across the wire.
query({ handler: () => ({ date: new Date() }) });
