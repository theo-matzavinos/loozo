import {
  DestroyRef,
  Directive,
  ElementRef,
  computed,
  forwardRef,
  inject,
  input,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";
import { FieldContext } from "./field";

/** Effective Label identity. */
export abstract class OrigamiFieldLabelOptions {
  /** Effective DOM ID. */
  abstract readonly id: Signal<string>;

  /**
   * Substitutes the Label's entire effective Options.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiFieldLabelOptions> | AbstractType<OrigamiFieldLabelOptions>,
  ): Provider {
    return { provide: OrigamiFieldLabelOptions, useExisting: forwardRef(type) };
  }

  /**
   * Substitutes reactive Label identity.
   * @param factory - Runs in injection context and supplies the required `id` signal.
   * @returns A local provider; defaults on an unused directive cannot repair missing Options.
   */
  static provideFactory(factory: () => OrigamiFieldLabelOptions): Provider {
    return { provide: OrigamiFieldLabelOptions, useFactory: factory };
  }
}

/**
 * The visible label of its nearest Field's control. On a `<label>`, `for` names the registered
 * control's ID, so clicking the label focuses or activates the control and the control takes its
 * accessible name from it; `for` is absent while no control is registered or the control is a
 * group, which a label can't name, and a static `for` is replaced. A group control, such as
 * `ogRadioGroup`, names every Label's ID in its `aria-labelledby` instead, so use any element,
 * such as a `<span>`, for its Label. It may come before or after the control. Several Labels may
 * name one control. It binds its effective `id` and registers it with its Field once Angular has
 * set its inputs. Outside a Field it binds only its `id` and keeps a static `for`.
 *
 * @example
 * ```html
 * <label ogFieldLabel>Email</label>
 * ```
 */
@Directive({
  selector: "[ogFieldLabel]",
  providers: [OrigamiFieldLabelOptions.provideExisting(() => OrigamiFieldLabel)],
  host: {
    "[id]": "effectiveId()",
    "[attr.for]": "controlId()",
  },
})
export class OrigamiFieldLabel implements OrigamiFieldLabelOptions {
  /** Own ID input, default opaque hydration-stable generated identity. Static/bound IDs drive default Options; replacements supply effective ID instead. */
  readonly id = input(injectUniqueId("field-label"));

  readonly #options = injectDeferred(OrigamiFieldLabelOptions);
  readonly #field = inject(FieldContext, { optional: true });
  /** Angular writes static attributes, including a composing directive's `host` ones, before creating directives. */
  readonly #staticFor = inject<ElementRef<Element>>(ElementRef).nativeElement.getAttribute("for");

  /** @internal Readonly effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  readonly #destroyRef = inject(DestroyRef);

  /** @internal The registered control's ID while a label can name it; outside a Field, the static `for`. */
  protected readonly controlId = computed(() => {
    if (this.#field === null) {
      return this.#staticFor;
    }

    return this.#field.labelFor();
  });

  /** @internal Registers this Label's ID with its Field once Angular has set its inputs. */
  ngOnInit(): void {
    this.#field?.registerLabel({ id: () => this.#options().id() }, this.#destroyRef);
  }
}
