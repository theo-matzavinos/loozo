import { Component, Directive, inject, input, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
  type OrigamiPopoverSide,
  type OrigamiPopoverAlign,
} from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";

/** A consumer factory supplies the complete Content Options shape. */
@Directive({
  selector: "[consumerPopoverContent]",
  exportAs: "consumerPopoverContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideFactory(() => inject(ConsumerPopoverContent))],
})
export class ConsumerPopoverContent implements OrigamiPopoverContentOptions {
  readonly id = input(injectUniqueId("acceptance-popover-content"));
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(0);
  readonly state = inject(OrigamiPopoverContentState);
}

/** Native presentation is driven only by Origami; callbacks observe or change intent. */
@Component({
  selector: "acceptance-popover",
  imports: [
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
    ConsumerPopoverContent,
  ],
  template: `
    <h1>Popover presentation and lifecycle</h1>
    <button type="button" data-testid="outside-focus">Outside focus target</button>
    <button type="button" data-testid="script-close-popover" (click)="open.set(false)">
      Close from consumer
    </button>
    <button type="button" data-testid="cancel-next-open" (click)="cancelNextOpen.set(true)">
      Cancel next native opening
    </button>
    <button type="button" data-testid="reopen-during-hide" (click)="reopenDuringHide.set(true)">
      Reopen from native hiding callback
    </button>
    <button type="button" data-testid="close-on-autofocus" (click)="closeOnAutofocus.set(true)">
      Close from autofocus callback
    </button>

    <div class="outer-scroll">
      <div class="inner-scroll">
        <div ogPopover [(open)]="open" (openChange)="openOutputs.update(increment)">
          <button ogPopoverTrigger ogPopoverAnchor data-testid="popover-trigger">
            Choose a task
          </button>
          <section
            consumerPopoverContent
            #content="consumerPopoverContent"
            [side]="side()"
            [align]="align()"
            [gap]="gap()"
            class="surface motion"
            role="group"
            aria-label="Tasks"
            data-testid="popover-content"
            (beforetoggle)="beforeToggle($event)"
          >
            @if (content.state.open()) {
              <label
                >Task name
                <input autofocus data-testid="autofocus-input" (focus)="autofocusReceived()"
              /></label>
              <p data-testid="popover-live-value">{{ liveValue() }}</p>
              <button
                type="button"
                data-testid="change-live-value"
                (click)="liveValue.set('updated')"
              >
                Update live binding
              </button>
              <button
                type="button"
                data-testid="change-placement"
                (click)="side.set('inline-end'); align.set('end'); gap.set(12)"
              >
                Change placement
              </button>
              <button type="button" data-testid="inside-script-close" (click)="open.set(false)">
                Close from inside
              </button>
            }
          </section>
        </div>
        <div class="scroll-space" aria-hidden="true"></div>
      </div>
    </div>
    <output data-testid="popover-intent">{{ open() }}</output>
    <output data-testid="popover-model-outputs">{{ openOutputs() }}</output>
    <output data-testid="autofocus-count">{{ autofocusCount() }}</output>

    <div ogPopover [(open)]="parentOpen" (openChange)="recordBranchOutput('parent', $event)">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="parent-trigger">Open parent</button>
      <section
        ogPopoverContent
        #parent="ogPopoverContent"
        class="surface motion"
        role="group"
        aria-label="Parent"
        data-testid="parent-content"
      >
        @if (parent.state.open()) {
          <button type="button" data-testid="parent-action">Parent action</button>
          <div
            ogPopover
            [(open)]="childOpen"
            [dismissible]="childDismissible()"
            (openChange)="recordBranchOutput('child', $event)"
          >
            <button ogPopoverTrigger ogPopoverAnchor data-testid="child-trigger">Open child</button>
            <section
              ogPopoverContent
              #child="ogPopoverContent"
              class="surface motion"
              role="group"
              aria-label="Child"
              data-testid="child-content"
            >
              @if (child.state.open()) {
                <button type="button" data-testid="child-action">Child action</button>
                <button
                  type="button"
                  data-testid="inside-script-suppress-parent"
                  (click)="parentOpen.set(false)"
                >
                  Suppress this branch from consumer
                </button>
              }
            </section>
          </div>
        }
      </section>
    </div>
    <button
      type="button"
      data-testid="protect-child"
      (click)="childDismissible.set(!childDismissible())"
    >
      Toggle child dismissal permission
    </button>
    <button type="button" data-testid="script-close-parent" (click)="parentOpen.set(false)">
      Suppress child from consumer
    </button>
    <output data-testid="child-intent">{{ childOpen() }}</output>
    <output data-testid="branch-outputs">{{ branchOutputs().join(",") }}</output>
  `,
  styles: [
    `
      :host {
        display: block;
        color-scheme: dark;
        background: #141414;
        color: #eeeeee;
        padding: 1rem;
        font-family: system-ui, sans-serif;
      }
      button {
        margin: 0.25rem;
      }
      output {
        display: block;
        margin-block: 0.5rem;
      }
      .outer-scroll {
        inline-size: min(100%, 24rem);
        block-size: 12rem;
        overflow: auto;
        transform: translateZ(0);
        border: 1px solid #666666;
      }
      .inner-scroll {
        inline-size: 30rem;
        block-size: 20rem;
        overflow: auto;
        transform: translateZ(0);
      }
      .scroll-space {
        inline-size: 40rem;
        block-size: 30rem;
      }
      .surface {
        inline-size: 18rem;
        max-inline-size: calc(100vw - 24px);
        max-block-size: 14rem;
        box-sizing: border-box;
        overflow: auto;
        padding: 1rem;
        border: 1px solid #777777;
        background: #242424;
        color: #eeeeee;
      }
      .surface:popover-open {
        display: grid;
        gap: 0.5rem;
      }
      .motion[data-entering] {
        animation: enter 120ms linear;
      }
      .motion[data-leaving] {
        animation: leave 120ms linear;
      }
      @keyframes enter {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @keyframes leave {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .motion {
          animation: none !important;
        }
      }
    `,
  ],
})
export class PopoverConsumer {
  readonly open = signal(false);
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly liveValue = signal("initial");
  readonly openOutputs = signal(0);
  readonly cancelNextOpen = signal(false);
  readonly reopenDuringHide = signal(false);
  readonly closeOnAutofocus = signal(false);
  readonly autofocusCount = signal(0);
  readonly parentOpen = signal(false);
  readonly childOpen = signal(false);
  readonly childDismissible = signal(true);
  readonly branchOutputs = signal<readonly string[]>([]);
  readonly increment = (value: number): number => value + 1;

  beforeToggle(event: Event): void {
    if (!(event instanceof ToggleEvent)) {
      throw new Error("Expected a native ToggleEvent");
    }

    if (event.newState === "open" && this.cancelNextOpen()) {
      this.cancelNextOpen.set(false);
      event.preventDefault();

      return;
    }

    if (event.newState === "closed" && this.reopenDuringHide()) {
      this.reopenDuringHide.set(false);
      this.open.set(true);
    }
  }

  autofocusReceived(): void {
    this.autofocusCount.update(this.increment);

    if (this.closeOnAutofocus()) {
      this.closeOnAutofocus.set(false);
      this.open.set(false);
    }
  }

  recordBranchOutput(owner: string, value: boolean): void {
    this.branchOutputs.update((events) => [...events, `${owner}:${value}`]);
  }
}
