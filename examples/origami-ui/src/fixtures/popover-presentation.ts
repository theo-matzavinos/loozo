import { Component, Directive, Service, inject, input, signal } from "@angular/core";
import type { WritableSignal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverOptions,
  OrigamiPopoverState,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverSide,
  type OrigamiPopoverAlign,
} from "@loozo/origami-ui/popover";
import { OrigamiPresenceState } from "@loozo/origami-ui/presence";

/** Consumer-authored style and callback controls for one client-mounted Popover. */
@Service({ autoProvided: false })
export class PresentationSettings {
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly dismissible = signal(true);
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly anchorMounted = signal(true);
  readonly opacity = signal("0.8");
  readonly pointerEvents = signal<string | null>(null);
  readonly closeOnFocus = signal(false);
  readonly cancelOpening = signal(false);
  readonly opacityOnShow = signal<string | null>(null);
  readonly opacityOnFocus = signal<string | null>(null);
  readonly sameSuppressionOnShow = signal(false);
  readonly sameSuppressionOnFocus = signal(false);
  readonly showCapture = signal("");
  readonly focusCapture = signal("");
  readonly shows = signal(0);
  readonly hides = signal(0);
  readonly focuses = signal(0);
  readonly synchronous = signal("none");
  readonly live = signal("initial");
}

function captureCallbackStyles(content: HTMLElement, event: Event, settings: PresentationSettings) {
  const computed = getComputedStyle(content);

  return JSON.stringify({
    computedOpacity: computed.opacity,
    computedPointer: computed.pointerEvents,
    boundOpacity: settings.opacity(),
    boundPointer: settings.pointerEvents(),
    trusted: event.isTrusted,
    native: content.matches(":popover-open"),
  });
}

@Directive({
  selector: "[presentationRoot]",
  exportAs: "presentationRoot",
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [
    PresentationSettings,
    OrigamiPopoverOptions.provideFactory(() => inject(PresentationSettings)),
  ],
})
export class PresentationRoot {
  readonly settings = inject(PresentationSettings);
  readonly state = inject(OrigamiPopoverState);

  /** Genuine native beforetoggle on the authored Content host. */
  native(event: Event): void {
    if (!(event instanceof ToggleEvent) || !(event.currentTarget instanceof HTMLElement)) {
      throw new Error("Expected a native ToggleEvent on the authored Content host");
    }

    if (event.newState !== "open") {
      this.settings.hides.update((value) => value + 1);

      return;
    }

    const content = event.currentTarget;

    this.settings.shows.update((value) => value + 1);
    this.settings.showCapture.set(captureCallbackStyles(content, event, this.settings));
    this.#author(content, this.settings.opacityOnShow, this.settings.sameSuppressionOnShow);

    if (this.settings.cancelOpening()) {
      event.preventDefault();
    }
  }

  /** Genuine native autofocus on a Content child. */
  focus(event: FocusEvent): void {
    if (!(event.currentTarget instanceof HTMLElement)) {
      throw new Error("Expected the native autofocus target");
    }

    const content = event.currentTarget.closest("section");

    if (content === null) {
      throw new Error("Expected the authored Content ancestor");
    }

    this.settings.focuses.update((value) => value + 1);
    this.settings.focusCapture.set(captureCallbackStyles(content, event, this.settings));
    this.#author(content, this.settings.opacityOnFocus, this.settings.sameSuppressionOnFocus);

    if (this.settings.closeOnFocus()) {
      this.settings.closeOnFocus.set(false);
      this.settings.open.set(false);
      this.settings.synchronous.set(`focus-close:${this.state.open()}`);
    }
  }

  /** Consumer writes inside a native callback, both directly and through its bindings. */
  #author(
    content: HTMLElement,
    opacity: WritableSignal<string | null>,
    sameSuppression: WritableSignal<boolean>,
  ): void {
    const value = opacity();

    if (value !== null) {
      opacity.set(null);
      content.style.setProperty("opacity", value, "important");
      content.style.setProperty("pointer-events", "auto");
      this.settings.opacity.set(`${value} !important`);
    }

    if (sameSuppression()) {
      sameSuppression.set(false);
      content.style.setProperty("opacity", "0", "important");
      content.style.setProperty("pointer-events", "none", "important");
      this.settings.opacity.set("0 !important");
      this.settings.pointerEvents.set("none !important");
    }
  }
}

@Directive({
  selector: "[presentationContent]",
  exportAs: "presentationContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideExisting(() => PresentationContent)],
  host: { "[attr.data-phase]": "phase()" },
})
export class PresentationContent implements OrigamiPopoverContentOptions {
  readonly #settings = inject(PresentationSettings);
  readonly id = input("presentation-content-id");
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
  readonly state = inject(OrigamiPopoverContentState);
  readonly phase = inject(OrigamiPresenceState).phase;
}

/** Client-mounted on demand, so ordinary Popover cases never share its page state. */
@Component({
  selector: "acceptance-popover-presentation",
  imports: [PresentationRoot, PresentationContent, OrigamiPopoverTrigger, OrigamiPopoverAnchor],
  template: `
    <div presentationRoot #root="presentationRoot" (unusedOpenChange)="unused.update(increment)">
      <div class="journal">
        <output data-testid="presentation-intent">{{ root.state.open() }}</output>
        <output data-testid="presentation-shows">{{ root.settings.shows() }}</output>
        <output data-testid="presentation-hides">{{ root.settings.hides() }}</output>
        <output data-testid="presentation-focuses">{{ root.settings.focuses() }}</output>
        <output data-testid="presentation-sync">{{ root.settings.synchronous() }}</output>
        <output data-testid="presentation-unused">{{ unused() }}</output>
        <output data-testid="presentation-show-capture">{{ root.settings.showCapture() }}</output>
        <output data-testid="presentation-focus-capture">{{ root.settings.focusCapture() }}</output>
        <output data-testid="presentation-bound-opacity">{{ root.settings.opacity() }}</output>
        <output data-testid="presentation-bound-pointer">{{
          root.settings.pointerEvents()
        }}</output>
      </div>
      <div class="controls">
        <button
          type="button"
          data-testid="presentation-open"
          (click)="root.settings.open.set(true)"
        >
          Open from Options
        </button>
        <button
          type="button"
          data-testid="presentation-close"
          (click)="root.settings.open.set(false)"
        >
          Close from Options
        </button>
        <button
          type="button"
          data-testid="presentation-restore-anchor"
          (click)="root.settings.anchorMounted.set(true)"
        >
          Restore Anchor
        </button>
        <button
          type="button"
          data-testid="presentation-arm-focus-close"
          (click)="root.settings.closeOnFocus.set(true)"
        >
          Close during autofocus
        </button>
        <button
          type="button"
          data-testid="presentation-cancel-show"
          (click)="root.settings.cancelOpening.set(true)"
        >
          Cancel next show
        </button>
        <button
          type="button"
          data-testid="presentation-important-opacity"
          (click)="root.settings.opacity.set('0.8 !important')"
        >
          Important opacity
        </button>
        <button
          type="button"
          data-testid="presentation-normal-opacity"
          (click)="root.settings.opacity.set('0.6')"
        >
          Normal opacity
        </button>
        <button
          type="button"
          data-testid="presentation-arm-show-opacity"
          (click)="root.settings.opacityOnShow.set('0.65')"
        >
          Important opacity in beforetoggle
        </button>
        <button
          type="button"
          data-testid="presentation-arm-focus-opacity"
          (click)="root.settings.opacityOnFocus.set('0.45')"
        >
          Important opacity in autofocus
        </button>
        <button
          type="button"
          data-testid="presentation-collision-baseline"
          (click)="
            root.settings.opacity.set('0.8 !important');
            root.settings.pointerEvents.set('auto !important')
          "
        >
          Important baseline
        </button>
        <button
          type="button"
          data-testid="presentation-arm-show-suppression"
          (click)="root.settings.sameSuppressionOnShow.set(true)"
        >
          Exact suppression values in beforetoggle
        </button>
        <button
          type="button"
          data-testid="presentation-arm-focus-suppression"
          (click)="root.settings.sameSuppressionOnFocus.set(true)"
        >
          Exact suppression values in autofocus
        </button>
        <button
          type="button"
          data-testid="presentation-next-style"
          (click)="
            root.settings.opacity.set('0.35 !important'); root.settings.pointerEvents.set('auto')
          "
        >
          Next consumer style
        </button>
      </div>
      <div class="outer" data-testid="presentation-outer">
        <div class="inner" data-testid="presentation-inner">
          @if (root.settings.anchorMounted()) {
            <button ogPopoverTrigger ogPopoverAnchor data-testid="presentation-trigger">
              Presentation Trigger and Anchor
            </button>
          }
          <section
            presentationContent
            #content="presentationContent"
            role="group"
            aria-label="Presentation tasks"
            class="surface motion"
            data-testid="presentation-content"
            style="--consumer-visual: preserved"
            [style.opacity]="root.settings.opacity()"
            [style.pointer-events]="root.settings.pointerEvents()"
            (beforetoggle)="root.native($event)"
          >
            @if (content.state.open()) {
              <input
                autofocus
                data-testid="presentation-autofocus"
                aria-label="Presentation autofocus"
                (focus)="root.focus($event)"
              />
              <p data-testid="presentation-live">{{ root.settings.live() }}</p>
              <button
                type="button"
                data-testid="presentation-live-change"
                (click)="root.settings.live.set('updated')"
              >
                Live update
              </button>
              <button
                type="button"
                data-testid="presentation-place"
                (click)="
                  root.settings.side.set('inline-end');
                  root.settings.align.set('end');
                  root.settings.gap.set(12)
                "
              >
                Logical placement
              </button>
              <button
                type="button"
                data-testid="presentation-remove-anchor"
                (click)="root.settings.anchorMounted.set(false)"
              >
                Unmount required Anchor
              </button>
            }
          </section>
          <div class="space" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset-block-start: 16px;
      inset-inline-end: 16px;
      z-index: 5;
      inline-size: 460px;
      padding: 8px;
      color-scheme: dark;
      background: #151515;
      color: #eee;
      border: 1px solid #555;
    }
    .journal output {
      display: block;
      max-inline-size: 440px;
      overflow: hidden;
      white-space: nowrap;
      font-size: 10px;
    }
    .controls button {
      margin: 2px;
      font-size: 11px;
    }
    .outer {
      inline-size: 420px;
      block-size: 200px;
      overflow: auto;
      transform: translateZ(0);
      border: 1px solid #777;
    }
    .inner {
      inline-size: 560px;
      block-size: 400px;
      overflow: auto;
      padding: 16px;
      box-sizing: border-box;
    }
    .space {
      inline-size: 700px;
      block-size: 500px;
    }
    .surface {
      inline-size: 220px;
      block-size: 160px;
      box-sizing: border-box;
      margin: 0;
      padding: 8px;
      border: 1px solid #aaa;
      background: #242424;
      color: #eee;
      overflow: auto;
    }
    .surface:popover-open {
      display: grid;
      gap: 3px;
    }
    /* Paint-only finite motion: no geometry or opacity contribution. */
    .motion[data-entering] {
      animation: presentation-enter 800ms linear;
    }
    .motion[data-leaving] {
      animation: presentation-leave 800ms linear;
    }
    @keyframes presentation-enter {
      from {
        background-color: #3a3a3a;
      }
      to {
        background-color: #242424;
      }
    }
    @keyframes presentation-leave {
      from {
        background-color: #242424;
      }
      to {
        background-color: #3a3a3a;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .motion {
        animation: none !important;
      }
    }
  `,
})
export class PopoverPresentation {
  readonly unused = signal(0);
  readonly increment = (value: number): number => value + 1;
}
