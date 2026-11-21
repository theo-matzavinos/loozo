import { Component, input } from "@angular/core";
import {
  OrigamiScrollArea,
  OrigamiScrollAreaContent,
  OrigamiScrollAreaScrollbar,
  OrigamiScrollAreaThumb,
  OrigamiScrollAreaViewport,
} from "@loozo/origami-ui/scroll-area";
import { ScrollAreaText, ScrollAreaWideLines } from "./scroll-area-hydration-text.js";

// SA19's areas inside `@defer` blocks. Only the blocks use them, so each block loads them lazily, as
// a consumer's own deferred component would be: hydration then runs the creation pass when the
// code resolves and the update pass in a later change detection.

/** A vertical-only area whose content overflows sideways (a `nowrap` line). */
@Component({
  selector: "scroll-area-axis",
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaWideLines,
  ],
  template: `
    <div ogScrollArea class="sa" [attr.data-testid]="name()">
      <div ogScrollAreaViewport class="sa-viewport" [attr.data-testid]="name() + '-viewport'">
        <div ogScrollAreaContent><scroll-area-wide-lines [name]="name()" /></div>
      </div>
      <div ogScrollAreaScrollbar class="sa-bar" [attr.data-testid]="name() + '-vbar'">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>
  `,
})
export class ScrollAreaAxis {
  readonly name = input.required<string>();
}

/** The plain control: a native scroller with the same content and static `overflow-x: hidden`. */
@Component({
  selector: "scroll-area-axis-plain",
  imports: [ScrollAreaWideLines],
  template: `
    <div class="sa" [attr.data-testid]="name()">
      <div
        class="sa-viewport"
        tabindex="0"
        style="overflow-x: hidden; overflow-y: auto; scrollbar-width: none"
        [attr.data-testid]="name() + '-viewport'"
      >
        <div><scroll-area-wide-lines [name]="name()" /></div>
      </div>
    </div>
  `,
})
export class ScrollAreaAxisPlain {
  readonly name = input.required<string>();
}

/** A two-axis area whose template overrides the Viewport's `overflow-x` to `hidden`. */
@Component({
  selector: "scroll-area-override",
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaWideLines,
  ],
  template: `
    <div ogScrollArea class="sa" [attr.data-testid]="name()">
      <div
        ogScrollAreaViewport
        class="sa-viewport"
        [style.overflow-x]="'hidden'"
        [attr.data-testid]="name() + '-viewport'"
      >
        <div ogScrollAreaContent><scroll-area-wide-lines [name]="name()" /></div>
      </div>
      <div ogScrollAreaScrollbar class="sa-bar" [attr.data-testid]="name() + '-vbar'">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        class="sa-bar"
        [attr.data-testid]="name() + '-hbar'"
      >
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>
  `,
})
export class ScrollAreaOverride {
  readonly name = input.required<string>();
}

/**
 * A two-axis area of wrappable text, its Content sized to the longest line. `styled` puts the
 * consumer's own static `style` on the Content or the Viewport; without it, both are styled by
 * class, the documented path.
 */
@Component({
  selector: "scroll-area-two-axis",
  imports: [
    OrigamiScrollArea,
    OrigamiScrollAreaViewport,
    OrigamiScrollAreaContent,
    OrigamiScrollAreaScrollbar,
    OrigamiScrollAreaThumb,
    ScrollAreaText,
  ],
  template: `
    <div ogScrollArea class="sa" [attr.data-testid]="name()">
      @switch (styled()) {
        @case ("viewport") {
          <div
            ogScrollAreaViewport
            class="sa-viewport"
            style="color: inherit"
            [attr.data-testid]="name() + '-viewport'"
          >
            <div ogScrollAreaContent [attr.data-testid]="name() + '-content'">
              <scroll-area-text [name]="name()" />
            </div>
          </div>
        }
        @case ("content") {
          <div ogScrollAreaViewport class="sa-viewport" [attr.data-testid]="name() + '-viewport'">
            <div
              ogScrollAreaContent
              style="color: inherit"
              [attr.data-testid]="name() + '-content'"
            >
              <scroll-area-text [name]="name()" />
            </div>
          </div>
        }
        @default {
          <div
            ogScrollAreaViewport
            class="sa-viewport sa-inherit"
            [attr.data-testid]="name() + '-viewport'"
          >
            <div ogScrollAreaContent class="sa-inherit" [attr.data-testid]="name() + '-content'">
              <scroll-area-text [name]="name()" />
            </div>
          </div>
        }
      }
      <div ogScrollAreaScrollbar class="sa-bar" [attr.data-testid]="name() + '-vbar'">
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
      <div
        ogScrollAreaScrollbar
        orientation="horizontal"
        class="sa-bar"
        [attr.data-testid]="name() + '-hbar'"
      >
        <div ogScrollAreaThumb class="sa-thumb"></div>
      </div>
    </div>
  `,
})
export class ScrollAreaTwoAxis {
  readonly name = input.required<string>();
  readonly styled = input<"content" | "viewport" | null>(null);
}
