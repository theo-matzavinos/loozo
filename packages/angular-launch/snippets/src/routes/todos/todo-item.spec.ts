import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { TodoItem } from "./todo-item.js";

describe("TodoItem", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it("completes the todo", async () => {
    const fixture = TestBed.createComponent(TodoItem);
    const http = TestBed.inject(HttpTestingController);

    fixture.componentRef.setInput("todo", { id: "1", title: "Buy milk", completed: false });

    const completing = fixture.componentInstance.complete();
    const call = http.expectOne({ method: "POST", url: "/_rpc/todos/complete" });

    expect(call.request.body).toEqual({ input: { id: "1" } });
    call.flush({ id: "1", title: "Buy milk", completed: true });
    await completing;

    expect(fixture.componentInstance.status()).toBe("Completed");
    http.verify();
  });

  it("handles the procedure's declared NOT_FOUND error", async () => {
    const fixture = TestBed.createComponent(TodoItem);
    const http = TestBed.inject(HttpTestingController);

    fixture.componentRef.setInput("todo", { id: "1", title: "Buy milk", completed: false });

    const completing = fixture.componentInstance.complete();

    // Status and message must match the declaration, or the client doesn't recognize the error.
    http
      .expectOne("/_rpc/todos/complete")
      .flush(
        { error: { code: "NOT_FOUND", message: "Todo does not exist", data: { id: "1" } } },
        { status: 404, statusText: "Not Found" },
      );
    await completing;

    expect(fixture.componentInstance.status()).toBe("This todo no longer exists.");
  });
});
