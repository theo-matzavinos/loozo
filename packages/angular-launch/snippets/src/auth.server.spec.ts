import { describe, expect, it, vi } from "vite-plus/test";
import { signedIn } from "./auth.server.js";
import { todos } from "./todos.server.js";

function args(user: { id: string } | null) {
  const request = new Request("http://localhost/_rpc/todos/list", { method: "POST" });

  return {
    context: { todos, user },
    request,
    signal: request.signal,
    response: { headers: new Headers(), setCookie: vi.fn(), deleteCookie: vi.fn() },
  };
}

describe("signedIn", () => {
  it("narrows the context to the signed-in user", () => {
    expect(signedIn(args({ id: "alice" }))).toEqual({ todos, user: { id: "alice" } });
  });

  it("refuses a caller without a user", () => {
    expect(() => signedIn(args(null))).toThrow();
  });
});
