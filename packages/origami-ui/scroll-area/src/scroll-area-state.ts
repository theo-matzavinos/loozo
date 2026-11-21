import { Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { ScrollAreaContext } from "./scroll-area-context";

/**
 * Locally provided readonly facade for the nearest ScrollArea root; nested roots have independent
 * owners. Read it through the root's template reference (`#area="ogScrollArea"`, then
 * `area.state.overflowY()`) or inject it in a descendant or a composing directive. Every signal is
 * false on the server and in the first hydrating render: they come from the browser's layout and
 * pointer, never from render.
 */
@Service({ autoProvided: false })
export class OrigamiScrollAreaState {
  readonly #context = inject(ScrollAreaContext);

  /**
   * Whether the content overflows the attached Viewport horizontally (its `scrollWidth` exceeds its
   * `clientWidth` by at least 1 px), as last measured in the browser. False without an attached
   * Viewport. The root binds it as `data-overflow-x`.
   */
  readonly overflowX: Signal<boolean> = this.#context.overflowX;
  /**
   * Whether the content overflows the attached Viewport vertically, as last measured in the
   * browser. False without an attached Viewport. The root binds it as `data-overflow-y`.
   */
  readonly overflowY: Signal<boolean> = this.#context.overflowY;
  /**
   * Whether the scrollbars should show: true while the pointer is over the root, during a thumb or
   * track drag and on each scroll, and false `hideDelay` ms after the last of those ended. A
   * Scrollbar is `data-visible` while this is true and its axis overflows. There is no event: react
   * to changes with an `effect()`.
   */
  readonly active: Signal<boolean> = this.#context.active;
}
