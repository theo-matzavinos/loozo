import { Component, DOCUMENT, inject, input, signal } from "@angular/core";
import type { AfterViewInit } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

/** The Trigger's text in a child component's view. */
@Component({
  selector: "acceptance-restore-label",
  template: `<span>{{ text() }}</span>`,
})
export class RestoreLabel {
  readonly text = input("");
}

/**
 * Mounted by the close's render: moves focus away from the closing Content before the Popover's
 * deferred restore, to the external input and off it again, or to a focusable `body`.
 */
@Component({
  selector: "acceptance-restore-redirect",
  template: ``,
})
export class RestoreRedirect implements AfterViewInit {
  readonly #document = inject(DOCUMENT);
  readonly mode = input.required<"blur" | "body">();

  ngAfterViewInit(): void {
    if (this.mode() === "body") {
      this.#document.body.tabIndex = -1;
      this.#document.body.focus();

      return;
    }

    const external = this.#document.querySelector<HTMLElement>('[data-testid="timing-external"]')!;

    external.focus();
    external.blur();
  }
}

/**
 * V21: a script close from inside Content that also changes the Trigger's text, which renders
 * in an `@if` and in a child component. V22: a script close whose render moves focus outside
 * Content before the restore. Its controls are script actions.
 */
@Component({
  selector: "acceptance-popover-restore-timing",
  imports: [
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    RestoreLabel,
    RestoreRedirect,
  ],
  template: `
    <div ogPopover [(open)]="open" (openChange)="opened($event)">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="timing-trigger">
        @if (choice(); as chosen) {
          <span>{{ chosen }}</span>
        } @else {
          <span>None</span>
        }
        <acceptance-restore-label [text]="choice() ?? 'none'" />
      </button>
      <div ogPopoverContent data-testid="timing-content" role="group" aria-label="Choices">
        <button type="button" data-testid="timing-one" (click)="choose('One')">One</button>
        <button type="button" data-testid="timing-two" (click)="choose('Two')">Two</button>
        <button type="button" data-testid="timing-blur" (click)="away('blur')">
          Away, blurred
        </button>
        <button type="button" data-testid="timing-body" (click)="away('body')">Away to body</button>
      </div>
    </div>
    <input data-testid="timing-external" aria-label="External" />
    @if (redirect(); as mode) {
      <acceptance-restore-redirect [mode]="mode" />
    }
    <output data-testid="timing-intent">{{ open() }}</output>
  `,
})
export class PopoverRestoreTiming {
  readonly open = signal(false);
  readonly choice = signal<string | null>(null);

  readonly redirect = signal<"blur" | "body" | null>(null);

  /** Each open unmounts the last redirect, so the next close mounts a fresh one. */
  opened(open: boolean): void {
    if (open) {
      this.redirect.set(null);
    }
  }

  /** Closes from script; the close's render mounts the redirect. */
  away(mode: "blur" | "body"): void {
    this.redirect.set(mode);
    this.open.set(false);
  }

  choose(choice: string): void {
    this.choice.set(choice);
    this.open.set(false);
  }
}
