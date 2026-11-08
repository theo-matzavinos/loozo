import { Component, ViewContainerRef, inject } from "@angular/core";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { CalendarContext } from "./calendar-context";

/**
 * @internal A Calendar root's selected-description node: a `<span hidden>` with a generated,
 * hydration-stable `id`, holding the root's `selectedDescription` text, empty while it is `""`.
 * A selected cell's `aria-describedby` names it while the text isn't empty. Never imported into a
 * template: the selector only names the host element `createComponent` creates.
 */
@Component({
  selector: "span",
  host: { hidden: "", "[id]": "id" },
  template: "{{ text() }}",
})
export class CalendarSelectedDescription {
  readonly #context = inject(CalendarContext);

  /** @internal The node's own ID: the server's while hydrating. */
  protected readonly id = injectUniqueId("calendar-selected");
  /** @internal The root's `selectedDescription`. */
  protected readonly text = this.#context.selectedDescription;

  constructor() {
    this.#context.registerSelectedDescription(this.id);
  }
}

/**
 * Creates the root's selected-description node as the root element's next sibling, under the
 * root element's injector, which provides the Context. Call it from the root's constructor: the
 * root is constructed on the server and in the browser alike, before any cell registers, so the
 * node exists on both, and a hydrating root's container claims the server's node, which
 * hydration matches by the component's definition ID.
 */
export function createSelectedDescription(): void {
  const container = inject(ViewContainerRef);

  container.createComponent(CalendarSelectedDescription, { injector: container.injector });
}
