import { DestroyRef, Directive, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId, injectUniqueValue } from "@loozo/origami-ui/utils";
import { TabsContext } from "./tabs";

/** Effective Panel configuration, used for visibility and mounted-only associations. */
export abstract class OrigamiTabsPanelOptions {
  /** The value whose selection shows this Panel and whose Trigger labels it. */
  abstract readonly value: Signal<string>;
  /** Effective DOM ID, named by the mounted Trigger's `aria-controls`. */
  abstract readonly id: Signal<string>;

  /**
   * Replaces Panel Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiTabsPanelOptions> | AbstractType<OrigamiTabsPanelOptions>,
  ): Provider {
    return { provide: OrigamiTabsPanelOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Panel Options with a structurally compatible result.
   * @param factory - Executes in Angular injection context; supply value and id.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiTabsPanelOptions): Provider {
    return { provide: OrigamiTabsPanelOptions, useFactory: factory };
  }
}

/**
 * Static `role="tabpanel"` content for the Trigger of the same value. It is `hidden` unless
 * its value is the root value, whether or not a Trigger with that value is mounted, and
 * carries `data-selected` while shown. `aria-labelledby` names only
 * a mounted Trigger of the same value. A static `tabindex="0"` makes the Panel a tab stop for
 * content without focusable children; a consumer's static `tabindex` overrides it. Panels have
 * no enter/exit Presence: gate heavy content with the root's State. Requires a nearest Tabs root.
 */
@Directive({
  selector: "[ogTabsPanel]",
  providers: [OrigamiTabsPanelOptions.provideExisting(() => OrigamiTabsPanel)],
  host: {
    role: "tabpanel",
    tabindex: "0",
    "[id]": "effectiveId()",
    "[attr.aria-labelledby]": "triggerId()",
    "[attr.hidden]": "hiddenAttribute()",
    "[attr.data-selected]": "selectedAttribute()",
  },
})
export class OrigamiTabsPanel implements OrigamiTabsPanelOptions {
  /**
   * Own value input, default a generated value that pairs with nothing; give each
   * Panel its Trigger's explicit value. Replaced Options supply the effective value.
   */
  readonly value = input(injectUniqueValue("tabs-panel-value"));
  /** Own ID input, default opaque hydration-stable generated identity; replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("tabs-panel"));

  readonly #options = injectDeferred(OrigamiTabsPanelOptions);
  readonly #context = inject(TabsContext);
  readonly #selected = computed(() => this.#context.value() === this.#options().value());

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal Mounted-only labelling association. */
  protected readonly triggerId = computed(() => this.#context.triggerId(this.#options().value()));

  /** @internal Hidden unless selected. */
  protected readonly hiddenAttribute = computed(() => {
    if (this.#selected()) {
      return null;
    }

    return "";
  });

  /** @internal Selected host marker. */
  protected readonly selectedAttribute = computed(() => {
    if (this.#selected()) {
      return "";
    }

    return null;
  });

  readonly #destroyRef = inject(DestroyRef);

  /** @internal Registers this Panel once Angular has set its inputs. */
  ngOnInit(): void {
    this.#context.registerPanel(this.#options, this.#destroyRef);
  }
}
