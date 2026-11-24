import {
  Component,
  ElementRef,
  afterRenderEffect,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
} from "@angular/core";
import {
  OrigamiQueryField,
  OrigamiQueryFieldContent,
  OrigamiQueryFieldErrors,
  OrigamiQueryFieldMessage,
  OrigamiQueryFieldOptions,
  OrigamiQueryFieldState,
  OrigamiQueryFieldSuggestion,
} from "@loozo/origami-ui/query-field";
import { LucideSearch } from "@lucide/angular";
import { cn } from "../cn";
import { optionClasses, popupClasses, popupListClasses } from "../popup";
import { ScrollArea } from "../scroll-area";
import type { SearchBarAnalysis, SearchBarSuggestion } from "./search-bar-suggestion";

// The metrics the input and the mark layer share: the icon's room at the start, the end padding
// and the border. The layer's clip box is then exactly the input's content box.
const METRICS =
  "[--search-bar-pad-start:2rem] [--search-bar-pad-end:0.625rem] [--search-bar-border:1px]";

/**
 * A query input over Origami's query field: a leading search icon, a SearchBarInput with Input's
 * look, the query tokens of your analysis marked behind its text (a tint on qualifiers, a red wavy
 * underline on invalid tokens), and a list under it with the invalid token's message above the
 * suggestions for the token at the caret. You parse the query and bind the analysis; Origami
 * tracks the caret, opens the list and applies a picked suggestion in place, undoably.
 *
 * @example
 * ```html
 * <div fold__SearchBar [(query)]="query" (caretChange)="caret.set($event)"
 *      [analysis]="analysis()" (search)="apply($event)">
 *   <input fold__SearchBarInput aria-label="Search reports" />
 * </div>
 * ```
 */
@Component({
  selector: "[fold__SearchBar]",
  exportAs: "fold__SearchBar",
  imports: [
    LucideSearch,
    OrigamiQueryFieldContent,
    OrigamiQueryFieldErrors,
    OrigamiQueryFieldMessage,
    OrigamiQueryFieldSuggestion,
    ScrollArea,
  ],
  hostDirectives: [{ directive: OrigamiQueryField, outputs: ["search", "caretChange"] }],
  // fold's own Options, replacing Origami's as a whole, so `state.suggestions()` has SearchBar's rows.
  providers: [OrigamiQueryFieldOptions.provideExisting(() => SearchBar)],
  host: { "data-slot": "search-bar", "[class]": "classes()" },
  // The icon and the marks sit behind the transparent input and are hidden from screen readers;
  // the rows and the message are inside Content, the errors in the hidden Errors the input's
  // description names.
  template: `
    <svg lucideSearch aria-hidden="true" data-slot="search-bar-icon" [class]="iconClasses"></svg>
    <div
      data-slot="search-bar-marks"
      aria-hidden="true"
      [class]="marksClasses"
      [attr.data-composing]="state.composing() || null"
    >
      <div [class]="clipClasses">
        <div
          data-slot="search-bar-marks-row"
          [class]="rowClasses"
          [style.translate.px]="-state.scrollLeft()"
        >
          @for (segment of state.segments(); track segment.start) {
            <span
              data-slot="search-bar-mark"
              [class]="markClasses"
              [attr.data-part]="segment.part"
              [attr.data-qualified]="segment.token?.qualifier ? '' : null"
              [attr.data-invalid]="segment.token?.error ? '' : null"
              >{{ segment.text }}</span
            >
          }
        </div>
      </div>
    </div>
    <ng-content />
    <div
      ogQueryFieldContent
      [gap]="4"
      data-slot="search-bar-content"
      tabindex="-1"
      [class]="contentClasses"
    >
      <div
        fold__ScrollArea
        [viewportTabIndex]="-1"
        class="-m-1 min-h-0 [&>[data-slot=scroll-area-viewport]]:overscroll-contain"
      >
        <div class="p-1">
          <!-- The message scrolls with the fixes, so a long one never squeezes them out of a short list. -->
          @if (state.caretToken()?.error; as error) {
            <p ogQueryFieldMessage data-slot="search-bar-message" [class]="messageClasses">
              {{ error }}
            </p>
          }
          @for (suggestion of state.suggestions(); track $index) {
            <div
              ogQueryFieldSuggestion
              [suggestion]="suggestion"
              data-slot="search-bar-suggestion"
              [class]="suggestionClasses"
            >
              <span class="min-w-0 flex-1 truncate">{{ suggestion.label }}</span>
              @if (suggestion.detail) {
                <span data-slot="search-bar-suggestion-detail" [class]="detailClasses">{{
                  suggestion.detail
                }}</span>
              }
            </div>
          }
        </div>
      </div>
    </div>
    <div ogQueryFieldErrors hidden data-slot="search-bar-errors">
      @for (token of state.tokens(); track token.start) {
        @if (token.error) {
          <p>{{ token.error }}</p>
        }
      }
    </div>
  `,
})
export class SearchBar implements OrigamiQueryFieldOptions<SearchBarSuggestion> {
  /** The whole query, two-way; it updates on every edit. */
  readonly query = model("");
  /** Your analysis of the query at the caret; null marks nothing and suggests nothing. */
  readonly analysis = input<SearchBarAnalysis | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly class = input("");

  readonly #field = inject(OrigamiQueryField);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  /**
   * Origami's readonly observation: `query`, `caret`, `tokens`, `segments`, `caretToken`,
   * `invalid`, `suggestions`, `open`, `scrollLeft`, `composing` and `disabled`.
   */
  readonly state = inject<OrigamiQueryFieldState<SearchBarSuggestion>>(OrigamiQueryFieldState);

  /** The token at the caret, by its start and message; a change of it starts the list anew. */
  readonly #caretToken = computed(() => {
    const token = this.state.caretToken();

    return token === null ? null : `${token.start}|${token.error ?? ""}`;
  });

  constructor() {
    // The message scrolls with the fixes, so a list kept open for another token would keep the
    // last token's offset and could hide the new message above it: start it from the top. A move
    // within the same token keeps your scrolling and the highlight's reveal.
    let previous: string | null = null;

    afterRenderEffect({
      write: () => {
        const token = this.#caretToken();

        if (token !== previous) {
          previous = token;

          const viewport = this.#host.querySelector<HTMLElement>(
            "[data-slot=search-bar-content] [data-slot=scroll-area-viewport]",
          );

          if (viewport !== null && viewport.scrollTop !== 0) {
            viewport.scrollTop = 0;
          }
        }
      },
    });
  }

  /** Focuses the input. */
  focus(options?: FocusOptions): void {
    this.#field.focus(options);
  }

  // A flex box exactly the input's size, painting the surface behind the transparent input; the
  // font is set here so the input and the mark row inherit the same one.
  protected readonly classes = computed(() =>
    cn(
      "group/search-bar relative isolate flex min-w-0 rounded-control bg-surface",
      "text-body font-sans tracking-normal",
      METRICS,
      this.class(),
    ),
  );

  // The 16px icon in the input's start padding, under the input, so a click on it reaches the input.
  protected readonly iconClasses = [
    "pointer-events-none absolute start-2.5 top-1/2 z-0 size-4 -translate-y-1/2 text-muted-foreground",
    "group-has-[input:disabled]/search-bar:opacity-50",
  ].join(" ");

  // The layer has the input's border (transparent) and padding, so its clip box below is exactly
  // the input's content box, where the input clips its scrolled text. Opted out of forced colors
  // so the marks keep their system colors.
  protected readonly marksClasses = [
    "pointer-events-none absolute inset-0 z-0 box-border border-(length:--search-bar-border) border-transparent ps-(--search-bar-pad-start) pe-(--search-bar-pad-end)",
    "group-has-[input:disabled]/search-bar:opacity-50 data-composing:hidden forced-color-adjust-none",
  ].join(" ");

  protected readonly clipClasses = "flex h-full items-center overflow-hidden";

  // The input's text, transparent, on one line, translated by the input's scroll offset.
  protected readonly rowClasses = "whitespace-pre text-transparent";

  // Marks paint only backgrounds, outlines and underlines: no padding, border, weight or font
  // change. Forced colors draw no fill, since the input's CanvasText glyphs sit over it: a 1px
  // CanvasText outline inside the mark instead, solid on a qualifier and dotted on its value, and a
  // CanvasText underline.
  protected readonly markClasses = [
    "rounded-[3px]",
    "data-[part=qualifier]:bg-primary/15 data-[part=value]:data-qualified:bg-primary/8",
    "data-invalid:underline data-invalid:decoration-wavy data-invalid:decoration-destructive-text data-invalid:decoration-1 data-invalid:underline-offset-3 data-invalid:[text-decoration-skip-ink:none]",
    "forced-colors:data-[part=qualifier]:bg-transparent forced-colors:data-[part=qualifier]:outline-1 forced-colors:data-[part=qualifier]:outline-solid",
    "forced-colors:data-[part=value]:data-qualified:bg-transparent forced-colors:data-[part=value]:data-qualified:outline-1 forced-colors:data-[part=value]:data-qualified:outline-dotted",
    "forced-colors:-outline-offset-1 forced-colors:outline-[CanvasText] forced-colors:data-invalid:decoration-[CanvasText]",
  ].join(" ");

  protected readonly contentClasses = cn(popupClasses, popupListClasses);

  // The caret token's message above the rows, in their scroll area, lined up with their text.
  protected readonly messageClasses =
    "px-2 pt-1.5 pb-1 text-label font-normal text-muted-foreground forced-colors:text-[CanvasText]";

  protected readonly suggestionClasses = cn(optionClasses);

  protected readonly detailClasses = "max-w-1/2 shrink-0 truncate text-label text-muted-foreground";
}
