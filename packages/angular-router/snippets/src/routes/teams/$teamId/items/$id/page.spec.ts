import { TestBed } from "@angular/core/testing";
import { provideRouter } from "@angular/router";
import { RouterTestingHarness } from "@angular/router/testing";
import { describe, expect, it } from "vitest";
import { routes } from "../../../../../../generated/routes.generated.js";
import { ItemCatalog, type Item, type ItemQuery } from "../../../../../catalog.js";
import ItemPage from "./page.js";

async function stubCatalog(query: ItemQuery): Promise<Item> {
  return { ...query, name: "Stub item" };
}

describe("ItemPage", () => {
  it("renders the item from the route's resolvers", async () => {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), { provide: ItemCatalog, useValue: stubCatalog }],
    });

    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl("/teams/7/items/3?score=5", ItemPage);

    expect(page.route.params()).toEqual({ teamId: 7, id: 3 });
    expect(page.route.search()).toEqual({ score: 5 });
    // The parent route's resolver result, merged into this route's data.
    expect(page.route.data().team).toEqual({ id: 7, name: "Team 7" });
    expect(page.route.data().item.name).toBe("Stub item");
    expect(harness.routeNativeElement?.querySelector("h1")?.textContent).toBe("Stub item");
  });
});
