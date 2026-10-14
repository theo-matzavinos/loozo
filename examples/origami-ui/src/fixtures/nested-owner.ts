import { Component, afterNextRender, signal } from "@angular/core";
import { OrigamiCollapsible } from "@loozo/origami-ui/collapsible";
import { OrigamiPopover } from "@loozo/origami-ui/popover";
import { NestedParts } from "./nested-parts.js";

@Component({
  selector: "acceptance-nested-owner",
  imports: [OrigamiCollapsible, OrigamiPopover, NestedParts],
  host: { "[attr.data-owner-render]": "renderSeen()" },
  template: `
    <section
      ogCollapsible
      [(expanded)]="expanded"
      ogPopover
      [(open)]="open"
      data-testid="nested-owner"
    >
      <button type="button" data-testid="nested-parent-attach" (click)="actions.update(increment)">
        Attach owner
      </button>
      <button
        type="button"
        data-testid="nested-parent-close"
        (click)="expanded.set(false); open.set(false)"
      >
        Close owner
      </button>
      <button
        type="button"
        data-testid="nested-parent-open"
        (click)="expanded.set(true); open.set(true)"
      >
        Reopen owner
      </button>
      @defer (hydrate on interaction) {
        <acceptance-nested-parts />
      } @placeholder {
        <p>Part placeholder</p>
      }
      <output data-testid="nested-parent-actions">{{ actions() }}</output>
      <output data-testid="nested-parent-intent">{{ open() }}</output>
    </section>
  `,
})
export class NestedOwner {
  readonly expanded = signal(true);
  readonly open = signal(true);
  readonly renderSeen = signal(false);
  readonly actions = signal(0);
  readonly increment = (value: number): number => value + 1;

  constructor() {
    afterNextRender(() => this.renderSeen.set(true));
  }
}
