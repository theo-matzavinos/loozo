import { InjectionToken } from "@angular/core";

export interface ItemQuery {
  readonly teamId: number;
  readonly id: number;
  readonly score: number | undefined;
}

export interface Item extends ItemQuery {
  readonly name: string;
}

export const ItemCatalog = new InjectionToken<(query: ItemQuery) => Promise<Item>>("ItemCatalog", {
  providedIn: "root",
  factory: () => {
    return async (query) => {
      return { ...query, name: `Item ${query.id}` };
    };
  },
});
