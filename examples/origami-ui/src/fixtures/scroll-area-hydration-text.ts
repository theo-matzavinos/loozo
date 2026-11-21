import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, inject, input } from "@angular/core";

// SA19's content, used both outside and inside its `@defer` blocks, so it lives apart from the
// areas that only the blocks use (`scroll-area-hydration-parts.ts`), which stay lazily loaded.

const lines: number[] = [];

for (let line = 0; line < 30; line++) {
  lines.push(line);
}

const sentence =
  "an ordinary sentence long enough to overflow the viewport sideways on one line, which wraps at its width";

/** Reports, as `<name>-rendered`, that its view rendered in the browser. */
@Component({
  selector: "scroll-area-hydrated",
  host: {
    "[attr.data-testid]": "name() + '-rendered'",
    "[attr.data-client-rendered]": "clientRendered",
  },
  template: ``,
})
export class ScrollAreaHydrated {
  readonly name = input.required<string>();
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
}

/** Lines of ordinary, wrappable text, each wider than a 300 px viewport on one line. */
@Component({
  selector: "scroll-area-text",
  imports: [ScrollAreaHydrated],
  template: `
    <scroll-area-hydrated [name]="name()" />
    @for (line of lines; track line) {
      <p class="sa-text">{{ name() }} {{ line }}: {{ sentence }}</p>
    }
  `,
})
export class ScrollAreaText {
  readonly name = input.required<string>();
  readonly lines = lines;
  readonly sentence = sentence;
}

/** One line that doesn't wrap, wider than a 300 px viewport, then short ones. */
@Component({
  selector: "scroll-area-wide-lines",
  imports: [ScrollAreaHydrated],
  template: `
    <scroll-area-hydrated [name]="name()" />
    <p class="sa-text sa-nowrap">{{ name() }}: {{ sentence }}</p>
    @for (line of lines; track line) {
      <p class="sa-text">{{ name() }} {{ line }}</p>
    }
  `,
})
export class ScrollAreaWideLines {
  readonly name = input.required<string>();
  readonly lines = lines;
  readonly sentence = sentence;
}
