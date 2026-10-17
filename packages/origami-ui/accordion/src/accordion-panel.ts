import { Directive, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiCollapsiblePanel,
  OrigamiCollapsiblePanelOptions,
} from "@loozo/origami-ui/collapsible";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { AccordionItemContext } from "./accordion-item";

/**
 * Effective upper Panel identity, forwarded to the composed Collapsible Options token.
 * Helper providers replace identity locally.
 */
export abstract class OrigamiAccordionPanelOptions {
  /** Authoritative reactive DOM ID, named by the mounted Trigger's aria-controls. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces upper Panel configuration; no lower Options replacement is required.
   * @param type - Compatible concrete or abstract class supplier, allowing forward references.
   * @returns A local provider, resolved after construction.
   */
  static provideExisting(
    type: () => Type<OrigamiAccordionPanelOptions> | AbstractType<OrigamiAccordionPanelOptions>,
  ): Provider {
    return { provide: OrigamiAccordionPanelOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces upper Panel identity as a whole.
   * @param factory - Injection-context factory supplying the required id signal.
   * @returns A local provider; lower bindings use this token instead of unused directive defaults.
   */
  static provideFactory(factory: () => OrigamiAccordionPanelOptions): Provider {
    return { provide: OrigamiAccordionPanelOptions, useFactory: factory };
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
    OrigamiAccordionPanelOptions.provideExisting(() => OrigamiAccordionPanel),
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
