// @vitest-environment node
// Server code: Node's Request keeps the Origin header, which happy-dom's Request drops.
import { describe, expect, it } from "vitest";
import { handleRequest } from "../../../generated/server.generated.js";

function call(procedure: string, input: unknown, cookie = "session=alice-session") {
  const request = new Request(`http://localhost/_rpc/todos/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost", cookie },
    body: JSON.stringify({ input }),
  });

  return handleRequest(request, { allowedHosts: ["localhost"] });
}

describe("todos.complete", () => {
  it("completes the user's todo", async () => {
    const response = await call("complete", { id: "1" });

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ id: "1", title: "Buy milk", completed: true });
  });

  it("answers NOT_FOUND for a todo the user doesn't have", async () => {
    const response = await call("complete", { id: "2" });

    expect(response?.status).toBe(404);
    expect(await response?.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Todo does not exist", data: { id: "2" } },
    });
  });

  it("refuses callers without a session", async () => {
    const response = await call("complete", { id: "1" }, "");
    const body = await response?.json();

    expect(response?.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
