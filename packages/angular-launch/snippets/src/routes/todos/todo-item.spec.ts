import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { By } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { routes } from "../../../generated/routes.generated.js";
import TodosPage from "./page.js";
import { TodoItem } from "./todo-item.js";

// TodoItem reads the todos route's handle, so it renders inside the page the router shows.
async function renderedItem() {
  const http = TestBed.inject(HttpTestingController);
  const harness = await RouterTestingHarness.create();
  const navigation = harness.navigateByUrl("/todos", TodosPage);

  await vi.waitFor(() =>
    http.expectOne("/_rpc/todos/list").flush([{ id: "1", title: "Buy milk", completed: false }]),
  );
  await navigation;
  harness.detectChanges();

  return harness.fixture.debugElement.query(By.directive(TodoItem)).componentInstance as TodoItem;
}

describe("TodoItem", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });
  });

  it("completes the todo", async () => {
    const item = await renderedItem();
    const http = TestBed.inject(HttpTestingController);
    const completing = item.complete();
    const call = http.expectOne({ method: "POST", url: "/_rpc/todos/complete" });

    expect(call.request.body).toEqual({ input: { id: "1" } });
    call.flush({ id: "1", title: "Buy milk", completed: true });
    await completing;

    expect(item.status()).toBe("Completed");
    http.verify();
  });

  it("handles the procedure's declared NOT_FOUND error", async () => {
    const item = await renderedItem();
    const http = TestBed.inject(HttpTestingController);
    const completing = item.complete();

    // Status and message must match the declaration, or the client doesn't recognize the error.
    http
      .expectOne("/_rpc/todos/complete")
      .flush(
        { error: { code: "NOT_FOUND", message: "Todo does not exist", data: { id: "1" } } },
        { status: 404, statusText: "Not Found" },
      );
    await completing;

    expect(item.status()).toBe("This todo no longer exists.");
  });
});
