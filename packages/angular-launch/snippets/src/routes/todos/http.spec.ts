// @vitest-environment node
// Server code: Node's Request keeps the Origin header, which happy-dom's Request drops.
import { describe, expect, it } from "vitest";
import { handleRequest } from "../../../generated/server.generated.js";

describe("POST /_rpc/todos/complete", () => {
  it("completes the todo of the user the session cookie names", async () => {
    const request = new Request("http://localhost/_rpc/todos/complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "http://localhost",
        cookie: "session=alice-session",
      },
      body: JSON.stringify({ input: { id: "1" } }),
    });

    const response = await handleRequest(request, { allowedHosts: ["localhost"] });

    expect(response?.status).toBe(200);
    expect(await response?.json()).toEqual({ id: "1", title: "Buy milk", completed: true });
  });
});
