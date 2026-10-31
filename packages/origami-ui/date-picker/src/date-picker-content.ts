import { Directive, HostAttributeToken, computed, forwardRef, inject, input } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import { ɵOrigamiCalendarPicker } from "@loozo/origami-ui/calendar";
import {
  OrigamiPopoverContent,
  OrigamiPopoverContentOptions,
  OrigamiPopoverContentState,
} from "@loozo/origami-ui/popover";
import type { OrigamiPopoverAlign, OrigamiPopoverSide } from "@loozo/origami-ui/popover";
import { injectUniqueId } from "@loozo/origami-ui/utils";
import { DatePickerContext } from "./date-picker-context";

/** Whole Content configuration, the composed Popover Content's fields. */
export abstract class OrigamiDatePickerContentOptions {
  /** Effective reactive DOM ID. */
  abstract readonly id: Signal<string>;
  /** Logical main side against the Trigger, direct default `block-end`. */
  abstract readonly side: Signal<OrigamiPopoverSide>;
  /** Logical cross alignment, direct default `start`. */
  abstract readonly align: Signal<OrigamiPopoverAlign>;
  /** Main-side separation in CSS pixels, direct default 0. */
  abstract readonly gap: Signal<number>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class.
   * @returns A local provider.
   */
  static provideExisting(
    type: () =>
      | Type<OrigamiDatePickerContentOptions>
      | AbstractType<OrigamiDatePickerContentOptions>,
  ): Provider {
    return { provide: OrigamiDatePickerContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option.
   * @param factory - Runs in injection context; supply `id`, `side`, `align` and `gap`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiDatePickerContentOptions): Provider {
    return { provide: OrigamiDatePickerContentOptions, useFactory: factory };
  }
}

/**
 * The picker's popup: `role="dialog"`, non-modal (no `aria-modal`, no focus trap), composing
 * Popover Content, so it is persistent, authored in place, presented in the native top layer and
 * `inert` while it isn't shown. `tabindex="-1"` keeps a press on its padding inside the picker.
 * Author the Calendar root of the picker's mode inside it, `ogCalendar` for `ogDatePicker`: the
 * picker binds its value, disabled and readonly, resets and focuses it on open, closes on its
 * completed choices, and its Grid doesn't join a Field. A Calendar of another mode is reported
 * through `ErrorHandler` and stays an unbound inline Calendar. Everything else inside Content,
 * such as your own buttons, is yours.
 *
 * Its name, unless it has its own static `aria-labelledby` or `aria-label` from the template:
 * `aria-labelledby` names the registered Trigger's Field Labels, or outside a Field and in the
 * field shape (a Trigger inside an `ogDateFieldInput` joins no Field) the Trigger's static
 * `aria-labelledby`; without either, the Trigger's static `aria-label` is its `aria-label`, so
 * a field shape's "Choose date" names the dialog; without that, `aria-labelledby` names the
 * Trigger, so its text names the dialog.
 * Only template attributes are read: a bound `aria-label` on the Trigger isn't copied, so name
 * Content yourself then.
 *
 * Like Popover Content, it exposes `--og-anchor-width` and `--og-available-height` for sizing,
 * retains its children through Presence's exit and exposes that retention as `state.open()`.
 * Scope a custom `display` to `:popover-open` and use `gap`, not margins. Requires a nearest
 * picker root; a second mounted Content fails.
 */
@Directive({
  selector: "[ogDatePickerContent]",
  exportAs: "ogDatePickerContent",
  hostDirectives: [OrigamiPopoverContent],
  providers: [
    OrigamiDatePickerContentOptions.provideExisting(() => OrigamiDatePickerContent),
    OrigamiPopoverContentOptions.provideFactory(() => inject(OrigamiDatePickerContentOptions)),
    {
      provide: ɵOrigamiCalendarPicker,
      useFactory: (): ɵOrigamiCalendarPicker<unknown> => {
        const context = inject(DatePickerContext);

        return {
          get mode() {
            return context.mode();
          },
          get value(): WritableSignal<unknown> {
            return context.value();
          },
          disabled: context.disabled,
          readonly: context.readonly,
          chosen: () => context.chosen(),
          register: (calendar, destroyRef) => context.registerCalendar(calendar, destroyRef),
        };
      },
    },
  ],
  host: {
    role: "dialog",
    tabindex: "-1",
    "[attr.aria-labelledby]": "labelledBy()",
    "[attr.aria-label]": "label()",
  },
})
export class OrigamiDatePickerContent implements OrigamiDatePickerContentOptions {
  /** Own ID input, default a generated opaque hosted identity. */
  readonly id = input(injectUniqueId("date-picker-content"));
  /** Own logical side input, default `block-end`. */
  readonly side = input<OrigamiPopoverSide>("block-end");
  /** Own logical cross alignment input, default `start`. */
  readonly align = input<OrigamiPopoverAlign>("start");
  /** Own main separation input in CSS pixels, default 0. */
  readonly gap = input(0);
  /** Readonly Presence retention of the composed Popover Content, for gating children through an exit. */
  readonly state = inject(OrigamiPopoverContentState);

  readonly #context = inject(DatePickerContext);
  /**
   * Content's template `aria-labelledby`. The template, not the element: under hydration the
   * element holds the server's bound value.
   */
  readonly #staticLabelledBy = inject(new HostAttributeToken("aria-labelledby"), {
    optional: true,
  });
  /** Content's template `aria-label`, read like its `aria-labelledby`. */
  readonly #staticLabel = inject(new HostAttributeToken("aria-label"), { optional: true });

  /**
   * @internal Content's own static `aria-labelledby`; without a static name, the Trigger's
   * Labels, else the Trigger itself unless its static `aria-label` names Content.
   */
  protected readonly labelledBy = computed(() => {
    if (this.#staticLabelledBy !== null || this.#staticLabel !== null) {
      return this.#staticLabelledBy;
    }

    const labels = this.#context.labelledBy();

    if (labels !== null) {
      return labels;
    }

    if (this.#context.triggerLabel() !== null) {
      return null;
    }

    return this.#context.triggerId();
  });
  /**
   * @internal Content's own static `aria-label`, else the Trigger's static one while nothing
   * names Content by `aria-labelledby`.
   */
  protected readonly label = computed(() => {
    if (this.#staticLabel !== null) {
      return this.#staticLabel;
    }

    if (this.labelledBy() !== null) {
      return null;
    }

    return this.#context.triggerLabel();
  });
}
