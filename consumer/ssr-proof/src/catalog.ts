import { InjectionToken } from "@angular/core";

export interface ItemValues {
  readonly teamId: number;
  readonly id: number;
  readonly score: number | undefined;
}

export interface Item extends ItemValues {
  readonly text: string;
}

export const ItemCatalog = new InjectionToken<(values: ItemValues) => Item>(
  "deterministic item catalog",
  {
    providedIn: "root",
    factory: () => (values) => ({
      ...values,
      text: `team=${values.teamId};item=${values.id};score=${String(values.score)}`,
    }),
  },
);
