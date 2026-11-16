import { DOCUMENT } from "@angular/common";
import {
  Component,
  DestroyRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";

/** A heading of the article that its table of contents links to. */
export interface ContentsEntry {
  /** The heading's element ID, on this page. */
  readonly id: string;
  readonly text: string;
  /** Indented below the entry before it. */
  readonly nested: boolean;
}

/**
 * A documentation page's article: its projected `<header>`, then a table of contents of
 * `contents`, then the rest of the projected content. An article with fewer than two entries gets
 * no table of contents.
 *
 * styles.css puts the table of contents in a sticky column beside the body on wide screens, where
 * it's always open; on narrow ones it's a disclosure under the header, closed until opened. In the
 * browser, the entry of the heading the reader has scrolled to is marked as the current location.
 */
@Component({
  selector: "docs-article",
  imports: [RouterLink, OrigamiCollapsible, OrigamiCollapsibleTrigger, OrigamiCollapsiblePanel],
  template: `
    <article class="prose article">
      <ng-content select="header" />

      @if (contents().length > 1) {
        <nav class="toc" aria-labelledby="toc-heading" ogCollapsible [(expanded)]="open">
          <h2 id="toc-heading" class="toc-heading">On this page</h2>
          <button ogCollapsibleTrigger class="toc-button">On this page</button>
          <!-- Collapsed hides the list only under 75rem; styles.css keeps it visible on wider screens. -->
          <ul ogCollapsiblePanel class="toc-list" (click)="closeAfterLink($event)">
            @for (entry of contents(); track entry.id) {
              <li [class.nested]="entry.nested">
                <!-- Same-page anchors to headings aren't route destinations, so not typed links. -->
                <a
                  [routerLink]="[]"
                  [fragment]="entry.id"
                  [attr.aria-current]="current() === entry.id ? 'location' : null"
                  >{{ entry.text }}</a
                >
              </li>
            }
          </ul>
        </nav>
      }

      <div class="article-body">
        <ng-content />
      </div>
    </article>
  `,
})
export class Article {
  readonly contents = input.required<readonly ContentsEntry[]>();

  /** Closed again whenever the page's contents change, as on a move to another guide. */
  readonly open = linkedSignal({ source: this.contents, computation: () => false });

  /** ID of the entry for the heading the reader has scrolled to, or null above the first one. */
  readonly current = signal<string | null>(null);

  readonly document = inject(DOCUMENT);

  readonly ids = computed(() => {
    const ids = [];

    for (const entry of this.contents()) {
      ids.push(entry.id);
    }

    return ids;
  });

  constructor() {
    // Browser-only: both hooks skip server rendering.
    afterRenderEffect({ read: () => this.current.set(this.scrolledTo(this.ids())) });

    const destroyRef = inject(DestroyRef);

    // Browsers dispatch scroll events at most once per frame, so this needs no throttling of its own.
    afterNextRender(() => {
      const window = this.document.defaultView!;
      const onScroll = () => this.current.set(this.scrolledTo(this.ids()));

      window.addEventListener("scroll", onScroll, { passive: true });
      destroyRef.onDestroy(() => window.removeEventListener("scroll", onScroll));
    });
  }

  /**
   * The last of `ids` whose heading has reached the top of the viewport, below the sticky header;
   * the last one once the page is scrolled to its end, where the final headings can't reach the top.
   */
  scrolledTo(ids: readonly string[]): string | null {
    if (ids.length < 2) {
      return null;
    }

    const root = this.document.documentElement;
    const atEnd = root.scrollTop + root.clientHeight >= root.scrollHeight - 1;

    if (atEnd) {
      return ids[ids.length - 1];
    }

    // The root's scroll-padding-top clears the sticky header, as fragment scrolling does.
    const line = Number.parseFloat(getComputedStyle(root).scrollPaddingTop) + 1;
    let current: string | null = null;

    for (const id of ids) {
      const heading = this.document.getElementById(id);

      if (heading === null) {
        continue;
      }

      if (heading.getBoundingClientRect().top > line) {
        break;
      }

      current = id;
    }

    return current;
  }

  closeAfterLink(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest("a") !== null) {
      this.open.set(false);
    }
  }
}
