import { Component, Directive, Service, computed, inject, input, signal } from "@angular/core";
import {
  OrigamiRadioGroup,
  OrigamiRadioGroupOptions,
  OrigamiRadioGroupState,
  OrigamiRadioGroupItem,
  OrigamiRadioGroupItemOptions,
} from "@loozo/origami-ui/radio-group";

@Service()
export class CheckoutStore {
  readonly speed = signal<string | null>("standard");
  readonly locked = signal(false);
}

// The checkout store owns the value and the lock; the primitive owns keys and focus.
@Directive({
  selector: "[appCheckoutSpeed]",
  hostDirectives: [OrigamiRadioGroup],
  providers: [
    OrigamiRadioGroupOptions.provideFactory(() => {
      const store = inject(CheckoutStore);

      return { value: store.speed, disabled: store.locked };
    }),
  ],
})
export class CheckoutSpeed {}

export type SpeedRecord = {
  readonly id: string;
  readonly label: string;
  readonly available: boolean;
};

// A radio whose value and availability come from a domain record.
@Directive({
  selector: "button[appSpeedOption]",
  hostDirectives: [OrigamiRadioGroupItem],
  providers: [OrigamiRadioGroupItemOptions.provideExisting(() => SpeedOption)],
})
export class SpeedOption implements OrigamiRadioGroupItemOptions {
  readonly option = input.required<SpeedRecord>({ alias: "appSpeedOption" });
  readonly value = computed(() => this.option().id);
  readonly disabled = computed(() => !this.option().available);
}

// A delivery estimate under the group, from descendant State.
@Component({
  selector: "app-speed-estimate",
  template: `{{ estimate() }}`,
})
export class SpeedEstimate {
  readonly #group = inject(OrigamiRadioGroupState);
  protected readonly estimate = computed(() => {
    if (this.#group.value() === "express") {
      return "Arrives tomorrow";
    }

    return "Arrives in 3–5 days";
  });
}

@Component({
  selector: "app-checkout",
  imports: [CheckoutSpeed, SpeedOption, SpeedEstimate],
  template: `
    <div appCheckoutSpeed aria-label="Shipping speed">
      @for (option of options(); track option.id) {
        <button [appSpeedOption]="option">{{ option.label }}</button>
      }
      <app-speed-estimate />
    </div>
  `,
})
export class Checkout {
  readonly options = signal<readonly SpeedRecord[]>([
    { id: "standard", label: "Standard", available: true },
    { id: "express", label: "Express", available: true },
    { id: "same-day", label: "Same day", available: false },
  ]);
}
