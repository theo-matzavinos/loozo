import { Component, input, model } from "@angular/core";

type Side = "start" | "end";

function initialSize(): number {
  return 2;
}

@Component({ selector: "fx-panel", template: "" })
export class Panel {
  readonly open = model(false);
  readonly side = input<Side | null>("end");
  readonly gap = input(-4);
  readonly label = input("Panel", { alias: "panelLabel" });
  readonly items = input<readonly string[]>([]);
  readonly size = input(initialSize());
  readonly notAnInput = 3;
}
