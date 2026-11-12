import { provideHttpClient } from "@angular/common/http";
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { describe, expect, it, vi } from "vitest";
import { routes } from "../../../generated/routes.generated.js";
import TodosPage from "./page.js";

describe("todos route", () => {
  it("resolves the list before showing the page", async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter(routes)],
    });

    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const navigation = harness.navigateByUrl("/todos", TodosPage);

    // The resolver calls the procedure once the navigation reaches it.
    await vi.waitFor(() => {
      const call = http.expectOne({ method: "POST", url: "/_rpc/todos/list" });

      expect(call.request.body).toEqual({ input: null });
      call.flush([{ id: "1", title: "Buy milk", completed: false }]);
    });

    const page = await navigation;

    expect(page.route.data().todos).toEqual([{ id: "1", title: "Buy milk", completed: false }]);
    expect(harness.routeNativeElement?.querySelector("li")?.textContent).toContain("Buy milk");
  });
});
