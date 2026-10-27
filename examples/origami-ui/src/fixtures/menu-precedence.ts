import {
  Component,
  Directive,
  InjectionToken,
  Service,
  computed,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuContentOptions,
  OrigamiMenuGroup,
  OrigamiMenuGroupLabel,
  OrigamiMenuGroupLabelOptions,
  OrigamiMenuItem,
  OrigamiMenuItemOptions,
  OrigamiMenuLink,
  OrigamiMenuLinkOptions,
  OrigamiMenuOptions,
  OrigamiMenuState,
  OrigamiMenuTrigger,
  OrigamiMenuTriggerOptions,
} from "@loozo/origami-ui/menu";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";

// MN16 (O1, O3): consumers compose every Menu part with Options through `hostDirectives`,
// exposing its own inputs with contradicting values, and replace its Options with ordinary
// signals: by factories in one case and by existing providers in the other. Trigger and Content
// replace only the Menu's Options, never the Popover's they compose.

const MenuCaseLabel = new InjectionToken<string>("menu precedence case label");

/** An action whose typeahead label differs from its text, so a search proves which one is read. */
type Action = { readonly name: string; readonly text: string; readonly label: string };

const actions: readonly (Action & { readonly disabled: boolean })[] = [
  { name: "rename", text: "Rename", label: "Title", disabled: false },
  { name: "archive", text: "Archive", label: "Box", disabled: true },
];
const destination: Action = { name: "share", text: "Share", label: "Link" };

/** Ordinary non-model replacement signals shared only by one consumer root. */
@Service({ autoProvided: false })
export class MenuPrecedenceSettings {
  readonly label = inject(MenuCaseLabel);
  readonly open = signal(false);
  readonly disabled = signal(true);
  // Element IDs that match between server and client: derived from the case, not allocated.
  readonly triggerId = signal(`${this.label}-trigger`);
  readonly triggerDisabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
  readonly contentId = signal(`${this.label}-content`);
  readonly side = signal<OrigamiPopoverSide>("inline-end");
  readonly align = signal<OrigamiPopoverAlign>("center");
  readonly gap = signal(11);
  readonly groupLabelId = signal(`${this.label}-group-label`);
  readonly selections = signal<readonly string[]>([]);
  readonly unusedOutputs = signal(0);
  readonly increment = (value: number): number => value + 1;

  changeIds(): void {
    this.triggerId.set(`${this.triggerId()}-changed`);
    this.contentId.set(`${this.contentId()}-changed`);
    this.groupLabelId.set(`${this.groupLabelId()}-changed`);
  }

  record(name: string): void {
    this.selections.update((selections) => [...selections, name]);
  }
}

const rootComposition = {
  directive: OrigamiMenu,
  inputs: ["open", "disabled"],
  outputs: ["openChange"],
};
const triggerComposition = {
  directive: OrigamiMenuTrigger,
  inputs: ["id", "disabled", "focusableWhenDisabled"],
};
const contentComposition = {
  directive: OrigamiMenuContent,
  inputs: ["id", "side", "align", "gap"],
};
const itemComposition = {
  directive: OrigamiMenuItem,
  inputs: ["disabled", "label"],
  outputs: ["select"],
};
const linkComposition = { directive: OrigamiMenuLink, inputs: ["label"], outputs: ["select"] };
const groupLabelComposition = { directive: OrigamiMenuGroupLabel, inputs: ["id"] };

// ---- Factory providers ----

@Directive({
  selector: "[precedenceFactoryMenu]",
  exportAs: "precedenceMenu",
  hostDirectives: [rootComposition],
  providers: [
    MenuPrecedenceSettings,
    OrigamiMenuOptions.provideFactory(() => inject(MenuPrecedenceSettings)),
  ],
})
export class PrecedenceFactoryMenu {
  readonly settings = inject(MenuPrecedenceSettings);
  readonly state = inject(OrigamiMenuState);
}

@Directive({
  selector: "button[precedenceFactoryMenuTrigger]",
  hostDirectives: [triggerComposition],
  providers: [
    OrigamiMenuTriggerOptions.provideFactory(() => {
      const settings = inject(MenuPrecedenceSettings);

      return {
        id: settings.triggerId,
        disabled: settings.triggerDisabled,
        focusableWhenDisabled: settings.focusableWhenDisabled,
      };
    }),
  ],
})
export class PrecedenceFactoryMenuTrigger {}

@Directive({
  selector: "[precedenceFactoryMenuContent]",
  hostDirectives: [contentComposition],
  providers: [
    OrigamiMenuContentOptions.provideFactory(() => {
      const settings = inject(MenuPrecedenceSettings);

      return {
        id: settings.contentId,
        side: settings.side,
        align: settings.align,
        gap: settings.gap,
      };
    }),
  ],
})
export class PrecedenceFactoryMenuContent {}

/** An item whose effective Options come from its own required `action` input. */
@Directive({
  selector: "button[precedenceFactoryMenuItem]",
  hostDirectives: [itemComposition],
  providers: [
    OrigamiMenuItemOptions.provideFactory(() => {
      const item = inject(PrecedenceFactoryMenuItem);

      return {
        disabled: computed(() => item.action().disabled),
        label: computed(() => item.action().label),
      };
    }),
  ],
})
export class PrecedenceFactoryMenuItem {
  readonly action = input.required<Action & { readonly disabled: boolean }>();
}

/** A link whose effective Options come from its own required `destination` input. */
@Directive({
  selector: "a[precedenceFactoryMenuLink]",
  hostDirectives: [linkComposition],
  providers: [
    OrigamiMenuLinkOptions.provideFactory(() => {
      const link = inject(PrecedenceFactoryMenuLink);

      return { label: computed(() => link.destination().label) };
    }),
  ],
})
export class PrecedenceFactoryMenuLink {
  readonly destination = input.required<Action>();
}

@Directive({
  selector: "[precedenceFactoryMenuGroupLabel]",
  hostDirectives: [groupLabelComposition],
  providers: [
    OrigamiMenuGroupLabelOptions.provideFactory(() => ({
      id: inject(MenuPrecedenceSettings).groupLabelId,
    })),
  ],
})
export class PrecedenceFactoryMenuGroupLabel {}

// ---- Existing providers ----

@Directive({
  selector: "[precedenceExistingMenu]",
  exportAs: "precedenceMenu",
  hostDirectives: [rootComposition],
  providers: [
    MenuPrecedenceSettings,
    OrigamiMenuOptions.provideExisting(() => PrecedenceExistingMenu),
  ],
})
export class PrecedenceExistingMenu implements OrigamiMenuOptions {
  readonly settings = inject(MenuPrecedenceSettings);
  readonly open = this.settings.open;
  readonly disabled = this.settings.disabled;
  readonly state = inject(OrigamiMenuState);
}

@Directive({
  selector: "button[precedenceExistingMenuTrigger]",
  hostDirectives: [triggerComposition],
  providers: [OrigamiMenuTriggerOptions.provideExisting(() => PrecedenceExistingMenuTrigger)],
})
export class PrecedenceExistingMenuTrigger implements OrigamiMenuTriggerOptions {
  readonly #settings = inject(MenuPrecedenceSettings);
  readonly id = this.#settings.triggerId;
  readonly disabled = this.#settings.triggerDisabled;
  readonly focusableWhenDisabled = this.#settings.focusableWhenDisabled;
}

@Directive({
  selector: "[precedenceExistingMenuContent]",
  hostDirectives: [contentComposition],
  providers: [OrigamiMenuContentOptions.provideExisting(() => PrecedenceExistingMenuContent)],
})
export class PrecedenceExistingMenuContent implements OrigamiMenuContentOptions {
  readonly #settings = inject(MenuPrecedenceSettings);
  readonly id = this.#settings.contentId;
  readonly side = this.#settings.side;
  readonly align = this.#settings.align;
  readonly gap = this.#settings.gap;
}

/** An item whose effective Options come from its own required `action` input. */
@Directive({
  selector: "button[precedenceExistingMenuItem]",
  hostDirectives: [itemComposition],
  providers: [OrigamiMenuItemOptions.provideExisting(() => PrecedenceExistingMenuItem)],
})
export class PrecedenceExistingMenuItem implements OrigamiMenuItemOptions {
  readonly action = input.required<Action & { readonly disabled: boolean }>();
  readonly disabled = computed(() => this.action().disabled);
  readonly label = computed(() => this.action().label);
}

/** A link whose effective Options come from its own required `destination` input. */
@Directive({
  selector: "a[precedenceExistingMenuLink]",
  hostDirectives: [linkComposition],
  providers: [OrigamiMenuLinkOptions.provideExisting(() => PrecedenceExistingMenuLink)],
})
export class PrecedenceExistingMenuLink implements OrigamiMenuLinkOptions {
  readonly destination = input.required<Action>();
  readonly label = computed(() => this.destination().label);
}

@Directive({
  selector: "[precedenceExistingMenuGroupLabel]",
  hostDirectives: [groupLabelComposition],
  providers: [OrigamiMenuGroupLabelOptions.provideExisting(() => PrecedenceExistingMenuGroupLabel)],
})
export class PrecedenceExistingMenuGroupLabel implements OrigamiMenuGroupLabelOptions {
  readonly id = inject(MenuPrecedenceSettings).groupLabelId;
}

// Every part exposes the composed directive's own inputs with values that contradict the
// replacement. Those inputs must remain unused while a replacement is present.
function menuTemplate(prefix: "precedenceFactoryMenu" | "precedenceExistingMenu"): string {
  return `
  <div ${prefix} #root="precedenceMenu" [open]="true" [disabled]="false"
    (openChange)="root.settings.unusedOutputs.update(root.settings.increment)">
    <button ${prefix}Trigger id="unused-direct-trigger" [disabled]="true" [focusableWhenDisabled]="true"
      class="anchor" data-co="trigger" [attr.data-testid]="root.settings.label + '-trigger'">
      Actions
    </button>
    <div ${prefix}Content id="unused-direct-content" side="block-start" align="end" [gap]="99"
      class="surface" data-co="content" [attr.data-testid]="root.settings.label + '-content'">
      <div ogMenuGroup data-co="group">
        <span ${prefix}GroupLabel id="unused-direct-label" data-co="group-label">Edit</span>
        @for (action of actions; track action.name) {
          <button ${prefix}Item [action]="action" [disabled]="!action.disabled" label="Unused"
            [attr.data-co]="action.name" (select)="root.settings.record(action.name)">
            {{ action.text }}
          </button>
        }
      </div>
      <a ${prefix}Link [destination]="destination" label="Unused" data-co="share"
        (select)="root.settings.record('share')">{{ destination.text }}</a>
    </div>
  </div>
  <output data-co="open">{{ root.settings.open() }} {{ root.state.open() }}</output>
  <output data-co="disabled">{{ root.state.disabled() }}</output>
  <output data-co="selected">{{ root.settings.selections().join(",") }}</output>
  <output data-co="unused-outputs">{{ root.settings.unusedOutputs() }}</output>
  <button type="button" data-co="enable" (click)="root.settings.disabled.set(false)">Enable</button>
  <button type="button" data-co="trigger-disable"
    (click)="root.settings.triggerDisabled.set(!root.settings.triggerDisabled())">
    Disable the Trigger
  </button>
  <button type="button" data-co="ids" (click)="root.settings.changeIds()">IDs</button>
`;
}

const menuStyles = `
  :host { display: block; padding-block: 24px; }
  output { display: block; }
  .anchor { inline-size: 90px; block-size: 30px; margin-inline-start: 20px; }
  .surface { inline-size: 160px; block-size: 110px; box-sizing: border-box; margin: 0; padding: 4px;
    background: #242424; color: #eee; border: 1px solid #888; }
  .surface:popover-open { display: flex; flex-direction: column; }
`;

/** Shared data of both cases. */
abstract class MenuPrecedenceCase {
  readonly actions = actions;
  readonly destination = destination;
}

@Component({
  selector: "menu-precedence-factory",
  imports: [
    OrigamiMenuGroup,
    PrecedenceFactoryMenu,
    PrecedenceFactoryMenuTrigger,
    PrecedenceFactoryMenuContent,
    PrecedenceFactoryMenuItem,
    PrecedenceFactoryMenuLink,
    PrecedenceFactoryMenuGroupLabel,
  ],
  providers: [{ provide: MenuCaseLabel, useValue: "menu-factory" }],
  host: { "data-case": "menu-factory" },
  template: menuTemplate("precedenceFactoryMenu"),
  styles: menuStyles,
})
export class MenuPrecedenceFactory extends MenuPrecedenceCase {}

@Component({
  selector: "menu-precedence-existing",
  imports: [
    OrigamiMenuGroup,
    PrecedenceExistingMenu,
    PrecedenceExistingMenuTrigger,
    PrecedenceExistingMenuContent,
    PrecedenceExistingMenuItem,
    PrecedenceExistingMenuLink,
    PrecedenceExistingMenuGroupLabel,
  ],
  providers: [{ provide: MenuCaseLabel, useValue: "menu-existing" }],
  host: { "data-case": "menu-existing" },
  template: menuTemplate("precedenceExistingMenu"),
  styles: menuStyles,
})
export class MenuPrecedenceExisting extends MenuPrecedenceCase {}
