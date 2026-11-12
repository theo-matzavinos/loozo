import type { Context } from "@loozo/angular-launch/server";
import { describe, expect, it, vi } from "vitest";
import { signedIn } from "./auth.server.js";
import { todos } from "./todos.server.js";

function args(user: Context["user"]) {
  const request = new Request("http://localhost/_rpc/todos/list", { method: "POST" });
  const context: Context = { request, todos, user };

  return {
    context,
    input: undefined,
    request,
    signal: request.signal,
    response: { headers: new Headers(), setCookie: vi.fn(), deleteCookie: vi.fn() },
    next: vi.fn(),
  };
}

describe("signedIn", () => {
  it("passes the signed-in user on", async () => {
    const call = args({ id: "alice" });

    await signedIn.run(call);

    expect(call.next).toHaveBeenCalledWith({ user: { id: "alice" } });
  });

  it("refuses a caller without a user", async () => {
    const call = args(null);

    await expect(signedIn.run(call)).rejects.toThrow();
    expect(call.next).not.toHaveBeenCalled();
  });
});
