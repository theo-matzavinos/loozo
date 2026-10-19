import {
  Component,
  Directive,
  Service,
  ViewEncapsulation,
  computed,
  inject,
  input,
  model,
  signal,
} from "@angular/core";
import {
  OrigamiTooltip,
  OrigamiTooltipContent,
  OrigamiTooltipContentOptions,
  OrigamiTooltipOptions,
  OrigamiTooltipState,
  OrigamiTooltipTrigger,
  type OrigamiTooltipAlign,
  type OrigamiTooltipSide,
} from "@loozo/origami-ui/tooltip";

// Consumer parts the Tooltip fixture composes: Content rendered by a child component (N1), a
// Tooltip inside an open shadow root (N4), a component root and a Content replacement through
// `hostDirectives` (N12), and public State observation from a descendant (N12).

/** N1: Content rendered by its own component, with a bound ID. */
@Component({
  selector: "acceptance-tooltip-text",
  imports: [OrigamiTooltipContent],
  template: `
    <span ogTooltipContent class="tooltip" [id]="contentId()" data-testid="describe-content">
      Switch between light and dark
    </span>
  `,
})
export class TooltipText {
  readonly contentId = input.required<string>();
}

/** N4: a whole Tooltip inside an open shadow root, where the document reports focus on the host. */
@Component({
  selector: "acceptance-shadow-tooltip",
  encapsulation: ViewEncapsulation.ShadowDom,
  imports: [OrigamiTooltip, OrigamiTooltipTrigger, OrigamiTooltipContent],
  template: `
    <button type="button" data-testid="shadow-before">Before</button>
    <span ogTooltip [openDelay]="300" [(open)]="open">
      <button type="button" ogTooltipTrigger data-testid="shadow-trigger">Shadow</button>
      <span ogTooltipContent data-testid="shadow-content">Shadow hint</span>
    </span>
  `,
})
export class ShadowTooltip {
  readonly open = model(false);
}

/** N12: the replacement Options a consumer root and its Content read; ordinary writable signals. */
@Service({ autoProvided: false })
export class HintSettings {
  readonly open = signal(false);
  readonly disabled = signal(false);
  readonly openDelay = signal(0);
  readonly side = signal<OrigamiTooltipSide>("block-end");
  readonly align = signal<OrigamiTooltipAlign>("start");
  readonly gap = signal(4);
  readonly id = signal("hint-content");
}

/**
 * N12: a consumer component root through `hostDirectives`. Its factory Options win over the
 * composed root's own inputs, which it exposes with contradicting values.
 */
@Component({
  selector: "acceptance-hint-root",
  hostDirectives: [
    {
      directive: OrigamiTooltip,
      inputs: ["open", "disabled", "openDelay"],
      outputs: ["openChange"],
    },
  ],
  providers: [HintSettings, OrigamiTooltipOptions.provideFactory(() => inject(HintSettings))],
  template: `<ng-content />`,
})
export class HintRoot {
  readonly settings = inject(HintSettings);
  readonly state = inject(OrigamiTooltipState);
}

/** N12: existing Content Options from the consumer's own class, over contradicting inputs. */
@Directive({
  selector: "[hintContent]",
  hostDirectives: [{ directive: OrigamiTooltipContent, inputs: ["side", "align", "gap", "id"] }],
  providers: [OrigamiTooltipContentOptions.provideExisting(() => HintContent)],
})
export class HintContent implements OrigamiTooltipContentOptions {
  readonly #settings = inject(HintSettings);
  readonly id = this.#settings.id;
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
}

/** N12: a descendant injecting the nearest root's public State. */
@Directive({
  selector: "[tooltipStateProbe]",
  host: {
    "[attr.data-open]": "state.open()",
    "[attr.data-disabled]": "state.disabled()",
    "[attr.data-shared]": "shared()",
  },
})
export class TooltipStateProbe {
  readonly state = inject(OrigamiTooltipState);
  readonly root = input.required<{ readonly state: OrigamiTooltipState }>({
    alias: "tooltipStateProbe",
  });
  readonly shared = computed(() => this.root().state === this.state);
}
