import {
  ChangeDetectorRef,
  Component,
  Directive,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  ErrorHandler,
  Service,
  afterNextRender,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
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
import { ActivatedRoute } from "@angular/router";
import { PopoverConsumer } from "./seeds/popover-consumer.js";
import { LifecycleCases } from "./lifecycle-cases.js";
import { PopoverPresentation } from "./popover-presentation.js";
import { NativeOwnerLifetime } from "./native-owner-lifetime.js";
import { LatePointer } from "./pointer-lifetime.js";
import { PopoverNamedForm } from "./popover-named-form.js";
import { PopoverShadow } from "./popover-shadow.js";

@Service({ autoProvided: false })
export class BranchJournal {
  readonly writes = signal<readonly string[]>([]);
}

@Service({ autoProvided: false })
export class ConsumerPaint {
  readonly opacity = signal("1");
  readonly pointer = signal("auto");
  readonly transform = signal("translateX(0px)");
  readonly text = signal("initial");
}

/** Reports through the application's ErrorHandler, after a callback armed for the next report. */
@Service({ autoProvided: false })
export class FixtureErrorHandler implements ErrorHandler {
  readonly #application = inject(ErrorHandler, { skipSelf: true });
  #nextReport: (() => void) | null = null;

  onNextReport(callback: () => void): void {
    this.#nextReport = callback;
  }

  handleError(error: unknown): void {
    const callback = this.#nextReport;

    this.#nextReport = null;
    callback?.();
    this.#application.handleError(error);
  }
}

@Service({ autoProvided: false })
export class NativeSettings {
  readonly journal = inject(BranchJournal);
  readonly route = inject(ActivatedRoute);
  readonly paint = inject(ConsumerPaint);
  /** The enclosing native owner's settings, for a descendant's setter to change its ancestor. */
  readonly ancestor = inject(NativeSettings, { optional: true, skipSelf: true });
  readonly initiallyOpen = this.route.snapshot.queryParamMap.get("initial") === "true";
  readonly disabled = signal(false);
  readonly dismissible = signal(true);
  readonly side = signal<OrigamiPopoverSide>("block-end");
  readonly align = signal<OrigamiPopoverAlign>("start");
  readonly gap = signal(8);
  readonly action = signal(this.route.snapshot.queryParamMap.get("native") ?? "none");
  readonly callbacks = signal<readonly string[]>([]);
  readonly openings = signal(0);
  readonly closings = signal(0);
  readonly autofocuses = signal(0);
  readonly mounted = signal(true);
  readonly triggerMounted = signal(true);
  readonly anchorMounted = signal(true);
  readonly contentMounted = signal(true);
  readonly reenterSetter = signal(false);
  readonly protectAncestorOnClose = signal(false);
  readonly setterObservations = signal<readonly string[]>([]);
  name: () => string = () => "unlabelled";
  state?: OrigamiPopoverState;
  content?: HTMLElement;
  readonly open = linkedSignal(() => this.initiallyOpen && this.name() === "parent", {
    set: (value, rawSet) => {
      rawSet(value);
      this.journal.writes.update((entries) => [...entries, `${this.name()}:${value}`]);

      if (!value && this.reenterSetter()) {
        this.reenterSetter.set(false);
        rawSet(true);
      }

      // A closing descendant's setter protects its still-open ancestor mid-dismissal.
      if (!value && this.protectAncestorOnClose()) {
        this.protectAncestorOnClose.set(false);
        this.ancestor?.dismissible.set(false);
      }

      const state = this.state;

      if (state) {
        this.setterObservations.update((entries) => [...entries, `${this.name()}:${state.open()}`]);
      }
    },
  });

  beforeToggle(event: Event): void {
    if (!(event instanceof ToggleEvent)) {
      throw new Error("Expected a native ToggleEvent");
    }

    if (event.newState === "open") {
      this.openings.update((value) => value + 1);
    } else {
      this.closings.update((value) => value + 1);
    }

    const action = this.action();

    if (event.newState === "open" && action === "cancel") {
      event.preventDefault();
      this.action.set("none");
    }

    if (event.newState === "open" && action === "close-before-reveal") {
      this.open.set(false);
      this.action.set("none");
    }

    if (event.newState === "closed" && action === "reopen-hide") {
      this.open.set(true);
      this.action.set("none");
    }

    if (event.newState === "closed" && action === "replace-hide") {
      this.contentMounted.set(false);
      this.action.set("none");
    }

    this.record(`beforetoggle:${event.newState}`);
  }

  autofocus(): void {
    this.autofocuses.update((value) => value + 1);

    const action = this.action();

    if (action === "close-focus") {
      this.open.set(false);
      this.action.set("none");
    }

    if (action === "reopen-focus") {
      this.open.set(false);
      this.open.set(true);
      this.action.set("none");
    }

    if (action === "destroy-focus") {
      this.mounted.set(false);
      this.action.set("none");
    }

    if (action === "style-focus") {
      this.paint.opacity.set(".6");
      this.paint.pointer.set("auto");
      this.paint.text.set("during-preparation");
      this.action.set("none");
    }

    this.record("focus");
  }

  record(event: string): void {
    if (!this.state) {
      throw new Error("Native callback owner State is missing");
    }

    this.callbacks.update((entries) => [
      ...entries,
      `${event}:requested=${this.state?.open()}:native=${this.content?.matches(":popover-open")}`,
    ]);
  }
}

@Directive({
  selector: "[nativePopover]",
  exportAs: "nativePopover",
  host: { "[attr.data-native-action]": "settings.action()" },
  hostDirectives: [{ directive: OrigamiPopover, outputs: ["openChange: unusedOpenChange"] }],
  providers: [NativeSettings, OrigamiPopoverOptions.provideFactory(() => inject(NativeSettings))],
})
export class NativePopover {
  readonly name = input("root");
  readonly settings = inject(NativeSettings);
  readonly state = inject(OrigamiPopoverState);

  constructor() {
    this.settings.name = () => this.name();
    this.settings.state = this.state;
  }
}

@Directive({
  selector: "[nativeContent]",
  exportAs: "nativeContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [OrigamiPopoverContentOptions.provideFactory(() => inject(NativeContent))],
})
export class NativeContent implements OrigamiPopoverContentOptions {
  readonly id = input("native-content");
  readonly settings = inject(NativeSettings);
  readonly side = this.settings.side;
  readonly align = this.settings.align;
  readonly gap = this.settings.gap;
  readonly state = inject(OrigamiPopoverContentState);
  readonly presence = inject(OrigamiPresenceState);
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    this.settings.content = this.element;
    inject(DestroyRef).onDestroy(() => {
      if (this.settings.content === this.element) {
        this.settings.content = undefined;
      }
    });
  }
}

/** Native callbacks change effective factory Options, never directly show/hide. */
@Component({
  selector: "acceptance-popover-fixture",
  imports: [
    PopoverConsumer,
    LifecycleCases,
    PopoverPresentation,
    NativeOwnerLifetime,
    LatePointer,
    PopoverShadow,
    PopoverNamedForm,
    NativePopover,
    NativeContent,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  providers: [
    BranchJournal,
    ConsumerPaint,
    FixtureErrorHandler,
    { provide: ErrorHandler, useExisting: FixtureErrorHandler },
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">Attach popover behavior</button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <h2>Native presentation variants</h2>
    <button type="button" data-testid="native-outside">Outside focus target</button>
    <button type="button" data-testid="native-transform" (click)="consumerTransform.set('translateX(7px)')">Change consumer transform</button>
    <button type="button" data-testid="after-native">After content in authored order</button>
    <section nativePopover #root="nativePopover" name="parent" (unusedOpenChange)="unusedOutputs.update(increment)">
      <div class="controls">
        <label>Callback action <select data-testid="native-action" (change)="setAction($event, root.settings)">
          <option value="none">None</option><option value="cancel">Cancel opening</option>
          <option value="close-focus">Close on autofocus</option><option value="reopen-focus">Close/reopen on autofocus</option>
          <option value="style-focus">Update consumer bindings during preparation</option>
          <option value="destroy-focus">Destroy on autofocus</option><option value="reopen-hide">Reopen during hide</option>
          <option value="replace-hide">Unmount content during hide</option><option value="close-before-reveal">Close before reveal</option>
        </select></label>
        <label>Motion <select data-testid="native-motion" (change)="select($event, motion)">
          <option value="finite">Finite</option><option value="none">None</option><option value="zero">Zero</option>
          <option value="infinite">Infinite</option><option value="mixed">Finite and infinite</option>
        </select></label>
        <label>Anchor writing mode <select data-testid="writing-mode" (change)="select($event, writingMode)">
          <option value="horizontal-tb">Horizontal</option><option value="vertical-rl">Vertical right to left</option><option value="vertical-lr">Vertical left to right</option>
          <option value="sideways-lr">Sideways (unsupported by Popover)</option>
        </select></label>
        <label>Anchor direction <select data-testid="anchor-direction" (change)="select($event, direction)"><option value="ltr">LTR</option><option value="rtl">RTL</option></select></label>
        <label>Content direction <select data-testid="content-direction" (change)="select($event, contentDirection)"><option value="rtl">RTL</option><option value="ltr">LTR</option></select></label>
        <button type="button" data-testid="native-anchor-rtl" (click)="anchorDirection.set('rtl')">Bind RTL on the separate anchor only</button>
        <button type="button" data-testid="native-other-flip-anchor" (click)="flipAnchorOnOtherOpening.set(true)">Unrelated opening makes the separate anchor RTL</button>
        <label>Logical side <select data-testid="native-side" (change)="setSide($event, root.settings)">
          <option value="block-end">Block end</option><option value="block-start">Block start</option><option value="inline-end">Inline end</option><option value="inline-start">Inline start</option>
        </select></label>
        <label>Alignment <select data-testid="native-align" (change)="setAlign($event, root.settings)"><option value="start">Start</option><option value="center">Center</option><option value="end">End</option></select></label>
        <button type="button" data-testid="native-autofocus-toggle" (click)="autofocus.set(!autofocus())">Use consumer autofocus</button>
        <button type="button" data-testid="native-protect" (click)="root.settings.dismissible.set(!root.settings.dismissible())">Protect root</button>
        <button type="button" data-testid="native-open" (click)="root.settings.open.set(true)">Request open from Options</button>
        <button type="button" data-testid="native-close" (click)="root.settings.open.set(false)">Request close from Options</button>
        <button type="button" data-testid="native-trigger-mount" (click)="root.settings.triggerMounted.set(!root.settings.triggerMounted())">Mount trigger</button>
        <button type="button" data-testid="native-anchor-mount" (click)="root.settings.anchorMounted.set(!root.settings.anchorMounted())">Mount anchor</button>
        <button type="button" data-testid="native-content-mount" (click)="root.settings.contentMounted.set(!root.settings.contentMounted())">Mount content</button>
        <button type="button" data-testid="native-owner-mount" (click)="root.settings.mounted.set(!root.settings.mounted())">Mount owner's parts</button>
        <button type="button" data-testid="native-disabled" (click)="root.settings.disabled.set(!root.settings.disabled())">Disable trigger</button>
        <button type="button" data-testid="native-trigger-disabled" (click)="triggerDisabled.set(!triggerDisabled())">Disable the trigger itself</button>
        <button type="button" data-testid="native-trigger-focusable" (click)="triggerFocusable.set(!triggerFocusable())">Keep the disabled trigger focusable</button>
        <button type="button" data-testid="native-trigger-inert" (click)="triggerInert.set(!triggerInert())">Make trigger inert</button>
        <button type="button" data-testid="native-co-locate" (click)="coLocated.set(!coLocated())">Co-locate anchor and trigger</button>
        <button type="button" data-testid="native-latch-configuration" (click)="latchPositionFailure(root.settings, 'configuration')">Open without ResizeObserver; a later WRITE changes the gap</button>
        <button type="button" data-testid="native-latch-intent" (click)="latchPositionFailure(root.settings, 'intent')">Open without ResizeObserver; a later WRITE closes and reopens</button>
        <button type="button" data-testid="native-supersede-position" (click)="supersedePosition(root.settings)">Change the gap, then the separate anchor's writing mode in the same task</button>
        <button type="button" data-testid="native-reentry-setter" (click)="root.settings.reenterSetter.set(true)">Reopen from actual Options setter</button>
        <label>Layout <select data-testid="native-layout" (change)="setLayout($event)">
          <option value="center">Centered</option><option value="bottom">Near bottom</option><option value="right">Near right</option>
          <option value="corner">Bottom right corner</option><option value="oversized">Oversized content</option>
        </select></label>
        <label>Pointer policy <select data-testid="pointer-policy" (change)="select($event, pointerPolicy)">
          <option value="normal">Normal</option><option value="prevent">Prevent down</option><option value="capture">Acquire pointer capture</option>
          <option value="mount-child">Mount an open child Popover</option>
        </select></label>
      </div>
      <button type="button" data-testid="pointer-outside" (pointerdown)="pointerDown($event)">Outside pointer target</button>
      <div class="gesture-controls">
        <button type="button" draggable="true" data-testid="native-drag-source" (dragstart)="dragStart($event)">Native drag source: cancel acquired pointer</button>
        <div data-testid="native-drag-target" (dragover)="$event.preventDefault()" (drop)="$event.preventDefault()">Native drop target</div>
      </div>
      @if (root.settings.mounted()) {
        <div class="scroll-one" [style.left.px]="left()" [style.top.px]="top()" data-testid="native-scroll-one">
          <div class="scroll-two" data-testid="native-scroll-two">
            <div class="anchor-region" [style.writing-mode]="writingMode()" [style.direction]="direction()">
              @if (root.settings.triggerMounted()) {
                @if (coLocated()) {
                  <button ogPopoverTrigger ogPopoverAnchor id="co-located-trigger" [inert]="triggerInert()" [disabled]="triggerDisabled()" [focusableWhenDisabled]="triggerFocusable()" data-testid="native-trigger">Native co-located trigger</button>
                } @else {
                  <button ogPopoverTrigger id="native-trigger-id" [inert]="triggerInert()" [disabled]="triggerDisabled()" [focusableWhenDisabled]="triggerFocusable()" data-testid="native-trigger">Native trigger</button>
                }
              }
              @if (!coLocated() && root.settings.anchorMounted()) {
                <span ogPopoverAnchor id="native-anchor-id" data-testid="native-anchor" [style.direction]="anchorDirection()">Separate anchor</span>
              }
              @if (root.settings.contentMounted()) {
                <section nativeContent #content="nativeContent" id="native-content-id" class="surface motion"
                  data-testid="native-content" [attr.data-phase]="content.presence.phase()"
                  [attr.data-retained]="content.state.open()" [attr.data-motion]="motion()"
                  [style.direction]="contentDirection()" [style.width.px]="width()" [style.height.px]="height()"
                  [style.opacity]="consumerOpacity()" [style.pointer-events]="consumerPointer()"
                  [style.transform]="consumerTransform()" style="z-index: 42;"
                  (beforetoggle)="root.settings.beforeToggle($event)" (toggle)="root.settings.record('toggle')">
                  @if (content.state.open()) {
                    @if (autofocus()) {
                      <input autofocus data-testid="native-autofocus" aria-label="Consumer autofocus" (focus)="root.settings.autofocus()" />
                    }
                    <button type="button" data-testid="native-first">First content control</button>
                    <button type="button" data-testid="native-inside-close" (click)="root.settings.open.set(false)">Close from inside</button>
                    <button type="button" data-testid="native-inside-reentry" (click)="root.settings.reenterSetter.set(true)">Reopen from setter</button>
                    <button type="button" data-testid="native-inside-hide-reopen" (click)="root.settings.action.set('reopen-hide')">Reopen during native hide</button>
                    <button type="button" data-testid="native-inside-layout" (click)="root.settings.side.set('inline-end'); root.settings.align.set('end'); root.settings.gap.set(12)">Change placement</button>
                    <button type="button" data-testid="native-inside-size" (click)="width.set(220); height.set(180)">Resize content</button>
                    <button type="button" data-testid="native-inside-style" (click)="consumerOpacity.set('.75'); consumerPointer.set('auto'); liveText.set('updated')">Update consumer styles/binding</button>
                    <p data-testid="native-live-text">{{ liveText() }}</p>
                  }
                  <!-- Logical child lifetime is independent of the parent's ordinary gated children. -->
                    <section nativePopover #child="nativePopover" name="child" data-testid="native-child-owner">
                      <button ogPopoverTrigger ogPopoverAnchor id="native-child-trigger" data-testid="native-child-trigger">Child trigger</button>
                      <section nativeContent #childContent="nativeContent" id="native-child-content" class="child-surface motion"
                        [attr.data-motion]="motion()" data-testid="native-child-content" [attr.data-retained]="childContent.state.open()">
                        @if (childContent.state.open()) {
                          <button type="button" data-testid="native-child-action">Child action</button>
                          <button type="button" data-testid="native-child-protect" (click)="child.settings.dismissible.set(!child.settings.dismissible())">Toggle child protection</button>
                          <button type="button" data-testid="native-child-suppress-parent" (click)="root.settings.open.set(false)">Suppress parent without clearing child intent</button>
                          <button type="button" data-testid="native-child-reenter" (click)="child.settings.reenterSetter.set(true)">Child setter reentry</button>
                          <button type="button" data-testid="native-child-protect-parent-on-close" (click)="child.settings.protectAncestorOnClose.set(true)">Child close setter protects parent</button>
                        }
                      </section>
                      <output data-testid="native-child-intent">{{ child.state.open() }}</output>
                    </section>
                  @if (pressChildMounted()) {
                    <section ogPopover [open]="pressChildOpen()" (openChange)="pressChildChange($event)">
                      <button ogPopoverTrigger ogPopoverAnchor id="native-press-child-trigger" data-testid="native-press-child-trigger">Press child trigger</button>
                      <section ogPopoverContent id="native-press-child-content" class="child-surface" data-testid="native-press-child-content">Mounted during an outside press</section>
                      <output data-testid="native-press-child-intent">{{ pressChildOpen() }}</output>
                    </section>
                  }
                </section>
              }
            </div>
            <div class="scroll-space" aria-hidden="true"></div>
          </div>
        </div>
      }
      <output data-testid="native-intent">{{ root.state.open() }}</output>
      <output data-testid="native-root-disabled">{{ root.state.disabled() }}</output>
      <output data-testid="native-openings">{{ root.settings.openings() }}</output>
      <output data-testid="native-closings">{{ root.settings.closings() }}</output>
      <output data-testid="native-autofocus-count">{{ root.settings.autofocuses() }}</output>
      <output data-testid="native-callbacks">{{ root.settings.callbacks().join('|') }}</output>
      <output data-testid="native-setter-observations">{{ root.settings.setterObservations().join('|') }}</output>
    </section>
    <section nativePopover #other="nativePopover" name="other">
      <button ogPopoverTrigger ogPopoverAnchor id="native-other-trigger" data-testid="native-other-trigger">Unrelated root</button>
      <section nativeContent #otherContent="nativeContent" id="native-other-content" class="child-surface" data-testid="native-other-content"
        (beforetoggle)="otherBeforeToggle($event)">
        @if (otherContent.state.open()) { <button type="button" data-testid="native-other-action">Unrelated action</button> }
      </section>
      <button type="button" data-testid="native-other-open" (click)="other.settings.open.set(true)">Authoritative unrelated open</button>
      <output data-testid="native-other-intent">{{ other.state.open() }}</output>
    </section>
    <output data-testid="native-journal">{{ journal.writes().join('|') }}</output>
    <output data-testid="native-unused-outputs">{{ unusedOutputs() }}</output>
    <acceptance-lifecycle-cases />
    <button type="button" data-testid="presentation-mount" (click)="presentationMounted.set(true)">Mount presentation case</button>
    @if (presentationMounted()) {
      <acceptance-popover-presentation />
    }
    <button type="button" data-testid="owner-lifetime-enable" (click)="ownerLifetimeMounted.set(true)">Mount native owner lifetime case</button>
    @if (ownerLifetimeMounted()) {
      <acceptance-native-owner-lifetime />
    }
    <button type="button" data-testid="late-pointer-enable" (click)="latePointerMounted.set(true)">Mount late pointer case</button>
    @if (latePointerMounted()) {
      <acceptance-late-pointer />
    }
    <button type="button" data-testid="shadow-mount" (click)="shadowMounted.set(true)">Mount shadow root case</button>
    @if (shadowMounted()) {
      <acceptance-popover-shadow />
    }
    <button type="button" data-testid="named-form-mount" (click)="namedFormMounted.set(true)">Mount named form case</button>
    @if (namedFormMounted()) {
      <acceptance-popover-named-form />
    }
    <acceptance-popover />
  `,
  styles: `
    :host {
      display: block;
      color-scheme: dark;
    }
    .gesture-controls {
      display: flex;
      flex-direction: column;
      width: 220px;
      gap: 40px;
    }
    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-block: 8px;
    }
    output {
      display: block;
    }
    button {
      margin: 2px;
    }
    .scroll-one {
      position: fixed;
      inline-size: 240px;
      block-size: 140px;
      overflow: auto;
      transform: translateZ(0);
      border: 2px solid #666;
      z-index: 1;
    }
    .scroll-two {
      inline-size: 340px;
      block-size: 220px;
      overflow: auto;
      transform: translateZ(0);
    }
    .anchor-region {
      margin: 32px;
    }
    [ogPopoverAnchor] {
      display: inline-block;
      width: 90px;
      height: 32px;
    }
    .scroll-space {
      width: 600px;
      height: 500px;
    }
    .surface,
    .child-surface {
      box-sizing: border-box;
      margin: 0;
      padding: 8px;
      border: 1px solid #777;
      overflow: auto;
      background: #242424;
      color: #eee;
    }
    .surface:popover-open,
    .child-surface:popover-open {
      display: grid;
      gap: 4px;
    }
    .child-surface {
      width: 160px;
      height: 120px;
    }
    .motion[data-entering][data-motion="finite"] {
      animation: enter 800ms linear;
    }
    .motion[data-leaving][data-motion="finite"] {
      animation: leave 800ms linear;
    }
    .motion[data-entering][data-motion="zero"],
    .motion[data-leaving][data-motion="zero"] {
      animation: enter 0s linear;
    }
    .motion[data-entering][data-motion="infinite"],
    .motion[data-leaving][data-motion="infinite"] {
      animation: pulse 1s linear infinite;
    }
    .motion[data-entering][data-motion="mixed"] {
      animation:
        enter 800ms linear,
        pulse 1s linear infinite;
    }
    .motion[data-leaving][data-motion="mixed"] {
      animation:
        leave 800ms linear,
        pulse 1s linear infinite;
    }
    @keyframes enter {
      from {
        opacity: 0.2;
      }
      to {
        opacity: 1;
      }
    }
    @keyframes leave {
      from {
        opacity: 1;
      }
      to {
        opacity: 0.2;
      }
    }
    @keyframes pulse {
      from {
        outline-offset: 0;
      }
      to {
        outline-offset: 2px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .motion {
        animation: none !important;
      }
    }
  `,
})
export class PopoverFixture {
  readonly journal = inject(BranchJournal);
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #environment = inject(EnvironmentInjector);
  readonly #errors = inject(FixtureErrorHandler);
  readonly #changeDetector = inject(ChangeDetectorRef);
  readonly attached = signal(false);
  readonly motion = signal("finite");
  readonly writingMode = signal("horizontal-tb");
  readonly direction = signal("ltr");
  readonly contentDirection = signal("rtl");
  readonly anchorDirection = signal<string | null>(null);
  readonly flipAnchorOnOtherOpening = signal(false);
  readonly autofocus = signal(true);
  readonly coLocated = signal(false);
  readonly triggerInert = signal(false);
  readonly triggerDisabled = signal(false);
  readonly triggerFocusable = signal(false);
  readonly pointerPolicy = signal("normal");
  readonly paint = inject(ConsumerPaint);
  readonly consumerOpacity = this.paint.opacity;
  readonly consumerPointer = this.paint.pointer;
  readonly consumerTransform = this.paint.transform;
  readonly liveText = this.paint.text;
  readonly left = signal(300);
  readonly top = signal(300);
  readonly width = signal(180);
  readonly height = signal(140);
  readonly unusedOutputs = signal(0);
  readonly presentationMounted = signal(false);
  readonly ownerLifetimeMounted = signal(false);
  readonly latePointerMounted = signal(false);
  readonly shadowMounted = signal(false);
  readonly namedFormMounted = signal(false);
  readonly pressChildMounted = signal(false);
  readonly pressChildOpen = signal(true);
  readonly increment = (value: number): number => value + 1;

  select(event: Event, target: { set(value: string): void }): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected a fixture select");
    }

    target.set(event.target.value);
  }

  /** A native callback in another owner's WRITE changes this Anchor's axes directly: no signal, Options or layout change. */
  otherBeforeToggle(event: Event): void {
    if (!(event instanceof ToggleEvent)) {
      throw new Error("Expected a native ToggleEvent");
    }

    if (event.newState !== "open" || !this.flipAnchorOnOtherOpening()) {
      return;
    }

    const anchor = this.element.querySelector('[data-testid="native-anchor"]');

    if (!(anchor instanceof HTMLElement)) {
      throw new Error("Expected the separate native anchor");
    }

    this.flipAnchorOnOtherOpening.set(false);
    anchor.style.direction = "rtl";
  }

  /**
   * Requests open without ResizeObserver. A WRITE registered now runs after the owner's WRITE,
   * which shows, and before its READ, which fails tracking acquisition with what that later WRITE
   * changed: the gap, or open set false then true. The report restores the observer.
   */
  latchPositionFailure(settings: NativeSettings, change: "configuration" | "intent"): void {
    const resizeObserver = window.ResizeObserver;

    Reflect.deleteProperty(window, "ResizeObserver");
    this.#errors.onNextReport(() => {
      Reflect.set(window, "ResizeObserver", resizeObserver);
      settings.record("report");
    });
    afterNextRender(
      {
        write: () => {
          if (change === "configuration") {
            settings.gap.set(12);
          } else {
            settings.open.set(false);
            settings.open.set(true);
          }

          settings.record("consumer-write");
        },
      },
      { injector: this.#environment },
    );
    settings.open.set(true);
  }

  /**
   * Changes the gap, so the owner's next READ starts a calculation. A READ registered now runs
   * after it, changes the separate Anchor's writing mode on the DOM only and renders again in the
   * same task: the owner's READ there starts a newer calculation before the older one resolves.
   */
  supersedePosition(settings: NativeSettings): void {
    afterNextRender(
      {
        read: () => {
          const anchor = this.element.querySelector('[data-testid="native-anchor"]');

          if (!(anchor instanceof HTMLElement)) {
            throw new Error("Expected the separate native anchor");
          }

          anchor.style.writingMode = "horizontal-tb";
          this.#changeDetector.markForCheck();
          settings.record("supersede");
        },
      },
      { injector: this.#environment },
    );
    settings.gap.set(12);
  }

  setAction(event: Event, settings: NativeSettings): void {
    this.select(event, settings.action);
  }

  setSide(event: Event, settings: NativeSettings): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected a side select");
    }

    const value = event.target.value;

    if (
      value !== "block-start" &&
      value !== "block-end" &&
      value !== "inline-start" &&
      value !== "inline-end"
    ) {
      throw new Error("Invalid logical side");
    }

    settings.side.set(value);
  }

  setAlign(event: Event, settings: NativeSettings): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected an alignment select");
    }

    const value = event.target.value;

    if (value !== "start" && value !== "center" && value !== "end") {
      throw new Error("Invalid alignment");
    }

    settings.align.set(value);
  }

  setLayout(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      throw new Error("Expected a layout select");
    }

    const value = event.target.value;

    this.left.set(300);
    this.top.set(300);
    this.width.set(180);
    this.height.set(140);

    const anchor = this.element.querySelector('[data-testid="native-anchor"]');

    if (!(anchor instanceof HTMLElement)) {
      throw new Error("The layout fixture requires a mounted separate anchor");
    }

    const rectangle = anchor.getBoundingClientRect();

    if (value === "bottom" || value === "corner") {
      this.top.set(300 + document.documentElement.clientHeight - 16 - rectangle.bottom);
    }

    if (value === "right" || value === "corner") {
      this.left.set(300 + document.documentElement.clientWidth - 16 - rectangle.right);
    }

    if (value === "oversized") {
      this.width.set(window.innerWidth + 200);
      this.height.set(window.innerHeight + 200);
    }
  }

  dragStart(event: DragEvent): void {
    if (!event.dataTransfer) {
      throw new Error("The native drag requires its genuine DataTransfer");
    }

    event.dataTransfer.setData("text/plain", "origami-native-gesture");
  }

  pointerDown(event: PointerEvent): void {
    if (this.pointerPolicy() === "prevent") {
      event.preventDefault();
    }

    if (this.pointerPolicy() === "capture" && event.target instanceof HTMLElement) {
      event.target.setPointerCapture(event.pointerId);
    }

    // Renders before the matching pointerup, inside the branch that this pointerdown captures.
    if (this.pointerPolicy() === "mount-child") {
      this.pressChildMounted.set(true);
    }
  }

  pressChildChange(open: boolean): void {
    this.pressChildOpen.set(open);
    this.journal.writes.update((entries) => [...entries, `press-child:${open}`]);
  }
}
