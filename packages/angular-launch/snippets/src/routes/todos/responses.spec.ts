// Keeps the README's table of responses to flush true: each row is recognized as documented.
import { HttpErrorResponse, provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { RpcNotFound, RpcRedirect } from "@loozo/angular-launch";
import { beforeEach, describe, expect, it } from "vitest";
import { injectRpc } from "./rpc.generated.js";

async function answer(body: object, status: number) {
  const rpc = TestBed.runInInjectionContext(() => injectRpc());
  const http = TestBed.inject(HttpTestingController);
  const calling = rpc.todos.complete({ id: "1" });

  http.expectOne("/_rpc/todos/complete").flush(body, { status, statusText: "Error" });

  try {
    await calling;
  } catch (error) {
    return { error, own: rpc.todos.complete.isError(error) };
  }

  throw new Error("The call didn't reject");
}

describe("responses from the README's table", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  for (const [body, status] of [
    [
      {
        error: {
          code: "INVALID_INPUT",
          message: "Invalid RPC input",
          data: { issues: [{ path: ["id"], message: "Expected a todo id" }] },
        },
      },
      400,
    ],
    [{ error: { code: "FORBIDDEN", message: "RPC forbidden", data: null } }, 403],
    [{ error: { code: "RPC_NOT_FOUND", message: "RPC not found", data: null } }, 404],
    [{ error: { code: "INTERNAL", message: "Internal server error", data: null } }, 500],
  ] as const) {
    it(`recognizes ${body.error.code}`, async () => {
      const { error, own } = await answer(body, status);

      expect(own).toBe(true);
      expect(error).toMatchObject({ code: body.error.code, status, data: body.error.data });
    });
  }

  it("rejects a redirect with RpcRedirect", async () => {
    const { error } = await answer({ redirect: { to: "/sign-in" } }, 303);

    expect(error).toBeInstanceOf(RpcRedirect);
    expect(error).toMatchObject({ to: "/sign-in" });
  });

  it("rejects a not-found outcome with RpcNotFound", async () => {
    const { error } = await answer({ notFound: null }, 404);

    expect(error).toBeInstanceOf(RpcNotFound);
  });

  it("leaves an unrecognized failure an HttpErrorResponse", async () => {
    const { error, own } = await answer(
      { error: { code: "NOT_FOUND", message: "Todo is missing", data: { id: "1" } } },
      404,
    );

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(own).toBe(false);
  });
});
