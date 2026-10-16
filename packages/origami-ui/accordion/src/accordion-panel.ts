import { Directive, InjectionToken, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollapsiblePanel,
  OrigamiCollapsiblePanelOptions,
} from "@loozo/origami-ui/collapsible";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { AccordionItemContext } from "./accordion-item";

const panelReplacement = new InjectionToken<OrigamiAccordionPanelOptions>(
  "Accordion Panel replacement",
);

/**
 * Effective upper Panel identity, forwarded to the composed Collapsible Options token.
 * Helper provider arrays replace identity locally, independent of co-matched directive import order.
 */
export abstract class OrigamiAccordionPanelOptions {
  /** Authoritative reactive DOM ID, named by the mounted Trigger's aria-controls. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Panel configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local replacement-and-alias provider array, resolved after construction.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionPanelOptions> | AbstractType<OrigamiAccordionPanelOptions>,
  ): Provider[] {
    return [
      { provide: panelReplacement, useExisting: forwardRef(type) },
      { provide: OrigamiAccordionPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * Replaces upper Panel identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local replacement-and-alias provider array; lower bindings use this token instead of unused directive defaults.
   */
  static provideFactory(factory: () => OrigamiAccordionPanelOptions): Provider[] {
    return [
      { provide: panelReplacement, useFactory: factory },
      { provide: OrigamiAccordionPanelOptions, useExisting: panelReplacement },
    ];
  }

  /**
   * @internal Creates a fallback-only Panel default, independent of co-matched directive import order.
   * @param type - Default directive supplier, resolved lazily after construction when no local replacement exists.
   * @returns A local array holding one Options factory, ignoring ancestor replacement tokens.
   */
  static ɵprovideDefault(type: () => Type<OrigamiAccordionPanelOptions>): Provider[] {
    return [
      {
        provide: OrigamiAccordionPanelOptions,
        useFactory: () => {
          const replacement = inject(panelReplacement, {
            self: true,
            optional: true,
          });

          if (replacement !== null) {
            return replacement;
          }

          return inject<OrigamiAccordionPanelOptions>(forwardRef(type));
        },
      },
    ];
  }
}

/**
 * Panel composed through Collapsible/Presence. Upper Options drive lower identity and
 * mounted-only labelling; desired expansion markers and finite exit hiding are inherited.
 * Consumers own headings, optional region role, content semantics and animation styles.
 * Requires a nearest Accordion Item.
 */
@Directive({
  selector: "[ogAccordionPanel]",
  hostDirectives: [OrigamiCollapsiblePanel],
  providers: [
    OrigamiAccordionPanelOptions.ɵprovideDefault(() => OrigamiAccordionPanel),
    OrigamiCollapsiblePanelOptions.provideFactory(() => inject(OrigamiAccordionPanelOptions)),
  ],
})
export class OrigamiAccordionPanel implements OrigamiAccordionPanelOptions {
  /** Own ID input, default opaque generated identity; static/bound IDs or substituted upper Options reactively update mounted-only controls links. */
  readonly id = input(injectUniqueId("accordion-panel"));

  /** Validates the nearest Accordion Item synchronously; a bare Collapsible owner is not an Accordion Item. */
  constructor() {
    inject(AccordionItemContext);
  }
}
