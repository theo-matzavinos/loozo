import { Component, Directive, computed, inject, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiCheckbox,
  OrigamiCheckboxOptions,
  OrigamiCheckboxState,
} from "@loozo/origami-ui/checkbox";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

/** A descendant of the button reading its Checkbox State through DI. */
@Directive({
  selector: "[checkboxStateProbe]",
  host: {
    "[attr.data-checked-state]": "state.checked()",
    "[attr.data-mixed-state]": "state.mixed()",
    "[attr.data-disabled-state]": "state.disabled()",
  },
})
export class CheckboxStateProbe {
  readonly state = inject(OrigamiCheckboxState);
}

/**
 * The falsifier: a consumer component that is the Checkbox through `hostDirectives`, exposing
 * the model, `disabled` and `touch`, so `[formField]` on it finds the Checkbox's model.
 */
@Component({
  selector: "button[consentCheckbox]",
  hostDirectives: [
    {
      directive: OrigamiCheckbox,
      inputs: ["checked", "disabled"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  template: `<span class="box" aria-hidden="true"></span>`,
})
export class ConsentCheckbox {}

/**
 * A consumer component composing the Checkbox through `hostDirectives` with the mixed pair
 * exposed beside the form-control members.
 */
@Component({
  selector: "button[mixedConsentCheckbox]",
  exportAs: "mixedConsentCheckbox",
  hostDirectives: [
    {
      directive: OrigamiCheckbox,
      inputs: ["checked", "mixed", "disabled"],
      outputs: ["checkedChange", "mixedChange", "touch"],
    },
  ],
  template: `<span class="box" aria-hidden="true"></span>`,
})
export class MixedConsentCheckbox {
  readonly checkbox = inject(OrigamiCheckbox);
}

/** Replacement Options state the composed Checkboxes read; changed by the fixture's buttons. */
@Directive({ selector: "[checkboxSettings]", exportAs: "checkboxSettings" })
export class CheckboxSettings {
  readonly checked = signal(true);
  readonly mixed = signal(false);
  readonly disabled = signal(false);
  readonly focusable = signal(false);
  readonly id = signal("replaced-checkbox");
}

/** J11's replacement Options state: unchecked and mixed, under its own ID. */
@Directive({
  selector: "[mixedCheckboxSettings]",
  exportAs: "mixedCheckboxSettings",
  providers: [{ provide: CheckboxSettings, useExisting: MixedCheckboxSettings }],
})
export class MixedCheckboxSettings extends CheckboxSettings {
  override readonly checked = signal(false);
  override readonly mixed = signal(true);
  override readonly id = signal("replaced-mixed-checkbox");
}

/** A consumer Checkbox with factory Options over its exposed own inputs and model output. */
@Directive({
  selector: "button[factoryCheckbox]",
  hostDirectives: [
    {
      directive: OrigamiCheckbox,
      inputs: ["checked", "mixed", "disabled", "id"],
      outputs: ["checkedChange", "mixedChange"],
    },
  ],
  providers: [
    OrigamiCheckboxOptions.provideFactory(() => {
      const settings = inject(CheckboxSettings);

      return {
        checked: settings.checked,
        mixed: settings.mixed,
        disabled: settings.disabled,
        focusableWhenDisabled: settings.focusable,
        id: settings.id,
      };
    }),
  ],
})
export class FactoryCheckbox {}

/** A consumer Checkbox whose existing Options are its own record. */
@Directive({
  selector: "button[existingCheckbox]",
  hostDirectives: [OrigamiCheckbox],
  providers: [OrigamiCheckboxOptions.provideExisting(() => ExistingCheckbox)],
})
export class ExistingCheckbox implements OrigamiCheckboxOptions {
  readonly checked = signal(false);
  readonly mixed = signal(false);
  readonly disabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
  readonly id = signal("existing-checkbox");
}

@Component({
  selector: "acceptance-checkbox-fixture",
  imports: [
    FormField,
    OrigamiCheckbox,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    CheckboxStateProbe,
    ConsentCheckbox,
    MixedConsentCheckbox,
    CheckboxSettings,
    MixedCheckboxSettings,
    FactoryCheckbox,
    ExistingCheckbox,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach checkbox behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Standalone</h2>
      <button
        ogCheckbox
        #remember="ogCheckbox"
        data-testid="standalone"
        aria-label="Remember me"
        aria-describedby="standalone-hint"
        [(checked)]="remembered"
        (checkedChange)="outputs.update(increment)"
      >
        <span checkboxStateProbe data-testid="standalone-probe"></span>
      </button>
      <p id="standalone-hint">Stay signed in on this device.</p>
      <output data-testid="standalone-value">{{ remembered() }}</output>
      <output data-testid="standalone-outputs">{{ outputs() }}</output>
      <output data-testid="standalone-state"
        >{{ remember.state.checked() }} {{ remember.state.disabled() }}</output
      >
      <button type="button" data-testid="write-standalone" (click)="remembered.update(flip)">
        Write the standalone model
      </button>

      <button
        ogCheckbox
        data-testid="disabled"
        aria-label="Disabled"
        [disabled]="true"
        [(checked)]="disabledChecked"
      ></button>
      <button
        ogCheckbox
        data-testid="focusable-disabled"
        aria-label="Focusable disabled"
        disabled
        focusableWhenDisabled
        [(checked)]="disabledChecked"
        (click)="ownClicks.update(increment)"
      ></button>
      <output data-testid="disabled-value">{{ disabledChecked() }}</output>
      <output data-testid="own-clicks">{{ ownClicks() }}</output>
      <button type="button" data-testid="write-disabled" (click)="disabledChecked.update(flip)">
        Write the disabled model
      </button>
    </section>

    <section>
      <h2>Field associations</h2>
      <div ogField data-testid="terms-field">
        <label ogFieldLabel data-testid="terms-label">Accept the terms</label>
        <button
          ogCheckbox
          data-testid="terms"
          aria-describedby="terms-static"
          [id]="termsId()"
        ></button>
        <p ogFieldDescription id="terms-description">You can withdraw at any time.</p>
      </div>
      <button type="button" data-testid="rename-terms" (click)="termsId.set('renamed-terms')">
        Rename the control
      </button>

      <div ogField data-testid="subscribe-field">
        <button ogCheckbox id="subscribe" data-testid="subscribe"></button>
        <label ogFieldLabel data-testid="subscribe-label">Subscribe to the newsletter</label>
      </div>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #consentField="ogField" data-testid="consent-field">
        <label ogFieldLabel>I agree to the privacy policy</label>
        <button ogCheckbox data-testid="consent" [formField]="account.consent"></button>
        <p ogFieldDescription id="consent-description">Required to continue.</p>
        @if (consentField.state.errorsShown()) {
          <p ogFieldError id="consent-error">{{ consentField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output data-testid="consent-value">{{ model().consent }}</output>
      <output data-testid="consent-touched">{{ account.consent().touched() }}</output>
      <button type="button" data-testid="write-consent" (click)="writeConsent()">
        Write the consent model
      </button>
      <button type="button" data-testid="focus-consent" (click)="account.consent().focusBoundControl()">
        Focus the consent control
      </button>
      <button type="button" data-testid="reset-consent" (click)="account.consent().reset()">
        Reset the consent field
      </button>

      <div ogField data-testid="updates-field">
        <label ogFieldLabel>Product updates</label>
        <button ogCheckbox data-testid="updates" [formField]="account.updates"></button>
      </div>
      <output data-testid="updates-value">{{ model().updates }}</output>
      <button type="button" data-testid="freeze-updates" (click)="frozen.update(flip)">
        Freeze updates
      </button>
      <button type="button" data-testid="lock-updates" (click)="locked.update(flip)">
        Lock updates
      </button>
      <button type="button" data-testid="submit-account" (click)="submitAccount()">Submit</button>
      <output data-testid="submits">{{ submits() }}</output>
    </section>

    <section>
      <h2>Composed through hostDirectives</h2>
      <div ogField #composedField="ogField" data-testid="composed-field">
        <label ogFieldLabel>Composed consent</label>
        <button consentCheckbox data-testid="composed" [formField]="account.composed"></button>
        @if (composedField.state.errorsShown()) {
          <p ogFieldError id="composed-error">Accept to continue.</p>
        }
      </div>
      <output data-testid="composed-value">{{ model().composed }}</output>
      <output data-testid="composed-touched">{{ account.composed().touched() }}</output>
      <button type="button" data-testid="write-composed" (click)="writeComposed()">
        Write the composed model
      </button>
      <button type="button" data-testid="freeze-composed" (click)="composedFrozen.update(flip)">
        Freeze the composed field
      </button>
      <button type="button" data-testid="lock-composed" (click)="composedLocked.update(flip)">
        Lock the composed field
      </button>
    </section>

    <section checkboxSettings #settings="checkboxSettings">
      <h2>Options replacement</h2>
      <div ogField>
        <label ogFieldLabel data-testid="replaced-label">Replaced</label>
        <button
          factoryCheckbox
          id="ignored"
          data-testid="replaced"
          [checked]="false"
          (checkedChange)="replacedOutputs.update(increment)"
        ></button>
      </div>
      <output data-testid="replaced-value">{{ settings.checked() }}</output>
      <output data-testid="replaced-outputs">{{ replacedOutputs() }}</output>
      <button type="button" data-testid="disable-replaced" (click)="settings.disabled.update(flip)">
        Disable the replaced control
      </button>
      <button type="button" data-testid="focusable-replaced" (click)="settings.focusable.update(flip)">
        Keep the replaced control focusable
      </button>
      <button type="button" data-testid="rename-replaced" (click)="settings.id.set('replaced-checkbox-2')">
        Rename the replaced control
      </button>
      <button existingCheckbox data-testid="existing" aria-label="Existing"></button>
    </section>

    <section>
      <h2>Mixed</h2>
      <button
        ogCheckbox
        #mixedStandalone="ogCheckbox"
        data-testid="mixed-standalone"
        aria-label="Select all files"
        [(checked)]="mixedChecked"
        [(mixed)]="mixedMixed"
        (mixedChange)="mixedLog.update(append('mixed', $event))"
        (checkedChange)="mixedLog.update(append('checked', $event))"
      >
        <span checkboxStateProbe data-testid="mixed-standalone-probe"></span>
      </button>
      <output data-testid="mixed-standalone-log">{{ mixedLog().join(" ") }}</output>
      <output data-testid="mixed-standalone-state"
        >{{ mixedStandalone.state.checked() }} {{ mixedStandalone.state.mixed() }}</output
      >
      <button type="button" data-testid="write-mixed" (click)="mixedMixed.set(true)">
        Make the files Checkbox mixed
      </button>

      <button
        ogCheckbox
        data-testid="mixed-checked"
        aria-label="Select all photos"
        [(checked)]="mixedCheckedChecked"
        [(mixed)]="mixedCheckedMixed"
        (mixedChange)="mixedCheckedLog.update(append('mixed', $event))"
        (checkedChange)="mixedCheckedLog.update(append('checked', $event))"
      ></button>
      <output data-testid="mixed-checked-log">{{ mixedCheckedLog().join(" ") }}</output>

      <button
        ogCheckbox
        data-testid="mixed-disabled"
        aria-label="Select all archived files"
        [disabled]="true"
        [(checked)]="mixedDisabledChecked"
        [(mixed)]="mixedDisabledMixed"
        (mixedChange)="mixedDisabledWrites.update(increment)"
        (checkedChange)="mixedDisabledWrites.update(increment)"
      ></button>
      <button
        ogCheckbox
        data-testid="mixed-focusable-disabled"
        aria-label="Select all shared files"
        disabled
        focusableWhenDisabled
        [(checked)]="mixedDisabledChecked"
        [(mixed)]="mixedDisabledMixed"
        (mixedChange)="mixedDisabledWrites.update(increment)"
        (checkedChange)="mixedDisabledWrites.update(increment)"
        (click)="mixedOwnClicks.update(increment)"
      ></button>
      <output data-testid="mixed-disabled-writes">{{ mixedDisabledWrites() }}</output>
      <output data-testid="mixed-own-clicks">{{ mixedOwnClicks() }}</output>
    </section>

    <section>
      <h2>Mixed with forms</h2>
      <div ogField #newslettersField="ogField" data-testid="newsletters-field">
        <label ogFieldLabel>All newsletters</label>
        <button
          mixedConsentCheckbox
          #newsletters="mixedConsentCheckbox"
          data-testid="newsletters"
          [formField]="mixedAccount.newsletters"
          [(mixed)]="newslettersMixed"
          (mixedChange)="newslettersLog.update(append(newslettersEntry('mixedChange', newsletters)))"
          (checkedChange)="newslettersLog.update(append(newslettersEntry('checkedChange', newsletters)))"
        ></button>
        <p ogFieldDescription id="newsletters-description">Some newsletters are selected.</p>
        @if (newslettersField.state.errorsShown()) {
          <p ogFieldError id="newsletters-error">Subscribe to continue.</p>
        }
      </div>
      <output data-testid="newsletters-value">{{ mixedModel().newsletters }}</output>
      <output data-testid="newsletters-touched">{{ mixedAccount.newsletters().touched() }}</output>
      <output data-testid="newsletters-log">{{ newslettersLog().join(" ") }}</output>
      <button type="button" data-testid="submit-newsletters" (click)="submitNewsletters()">
        Submit the newsletters
      </button>
      <button type="button" data-testid="reset-newsletters" (click)="resetNewsletters()">
        Reset the newsletters to partial
      </button>
      <button type="button" data-testid="freeze-newsletters" (click)="newslettersFrozen.update(flip)">
        Freeze the newsletters
      </button>
      <button type="button" data-testid="lock-newsletters" (click)="newslettersLocked.update(flip)">
        Lock the newsletters
      </button>

      <div ogField>
        <label ogFieldLabel>All reminders</label>
        <button
          ogCheckbox
          data-testid="reminders"
          [formField]="mixedAccount.reminders"
          [mixed]="true"
        ></button>
      </div>
      <output data-testid="reminders-value">{{ mixedModel().reminders }}</output>
      <output data-testid="reminders-valid">{{ mixedAccount.reminders().valid() }}</output>
      <button type="button" data-testid="replace-reminders" (click)="replaceReminders()">
        Replace the reminders value
      </button>

      <div mixedCheckboxSettings #mixedSettings="mixedCheckboxSettings">
        <button
          factoryCheckbox
          data-testid="mixed-replaced"
          aria-label="Mixed replacement"
          [checked]="false"
          [mixed]="false"
          (checkedChange)="mixedReplacedOutputs.update(increment)"
          (mixedChange)="mixedReplacedOutputs.update(increment)"
        ></button>
        <output data-testid="mixed-replaced-value"
          >{{ mixedSettings.checked() }} {{ mixedSettings.mixed() }}</output
        >
        <output data-testid="mixed-replaced-outputs">{{ mixedReplacedOutputs() }}</output>
      </div>
    </section>

    <section>
      <h2>Select all</h2>
      <div ogField>
        <button
          ogCheckbox
          data-testid="vehicles-parent"
          aria-controls="vehicle-car vehicle-van vehicle-bus"
          [checked]="allVehicles()"
          [mixed]="someVehicles()"
          [disabled]="selectableVehicles().length === 0"
          (mixedChange)="vehiclesLog.update(append('mixed', $event))"
          (checkedChange)="vehiclesLog.update(append('checked', $event)); selectAllVehicles($event)"
        ></button>
        <label ogFieldLabel data-testid="vehicles-label">Select all available vehicles</label>
      </div>
      @for (vehicle of vehicles; track vehicle.id) {
        <div ogField>
          <button
            ogCheckbox
            [id]="'vehicle-' + vehicle.id"
            [attr.data-testid]="'vehicle-' + vehicle.id"
            [disabled]="vehicle.disabled"
            [checked]="selectedVehicles().has(vehicle.id)"
            (checkedChange)="selectVehicle(vehicle.id, $event)"
          ></button>
          <label ogFieldLabel>{{ vehicle.label }}</label>
        </div>
      }
      <output data-testid="vehicles-selected">{{ selectedVehicleList() }}</output>
      <output data-testid="vehicles-log">{{ vehiclesLog().join(" ") }}</output>
    </section>
  `,
})
export class CheckboxFixture {
  readonly attached = signal(false);
  readonly remembered = signal(false);
  readonly outputs = signal(0);
  readonly disabledChecked = signal(false);
  readonly ownClicks = signal(0);
  readonly termsId = signal("terms");
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly composedFrozen = signal(false);
  readonly composedLocked = signal(false);
  readonly submits = signal(0);
  readonly replacedOutputs = signal(0);
  readonly mixedChecked = signal(false);
  readonly mixedMixed = signal(true);
  readonly mixedLog = signal<readonly string[]>([]);
  readonly mixedCheckedChecked = signal(true);
  readonly mixedCheckedMixed = signal(true);
  readonly mixedCheckedLog = signal<readonly string[]>([]);
  readonly mixedDisabledChecked = signal(false);
  readonly mixedDisabledMixed = signal(true);
  readonly mixedDisabledWrites = signal(0);
  readonly mixedOwnClicks = signal(0);
  readonly newslettersMixed = signal(true);
  readonly newslettersLog = signal<readonly string[]>([]);
  readonly newslettersFrozen = signal(false);
  readonly newslettersLocked = signal(false);
  readonly mixedReplacedOutputs = signal(0);
  readonly mixedModel = signal({ newsletters: false, reminders: false });
  readonly mixedAccount = form(this.mixedModel, (path) => {
    required(path.newsletters);
    readonly(path.newsletters, () => this.newslettersFrozen());
    disabled(path.newsletters, () => this.newslettersLocked());
    required(path.reminders);
  });
  readonly vehicles = [
    { id: "car", label: "Car", disabled: false },
    { id: "van", label: "Van", disabled: false },
    { id: "bus", label: "Bus", disabled: true },
  ];
  readonly selectedVehicles = signal<ReadonlySet<string>>(new Set(["car"]));
  readonly vehiclesLog = signal<readonly string[]>([]);
  /** The children selectAllVehicles can change. */
  readonly selectableVehicles = computed(() => {
    const ids: string[] = [];

    for (const vehicle of this.vehicles) {
      if (!vehicle.disabled) {
        ids.push(vehicle.id);
      }
    }

    return ids;
  });
  readonly selectedVehicleCount = computed(() => {
    let count = 0;

    for (const id of this.selectableVehicles()) {
      if (this.selectedVehicles().has(id)) {
        count++;
      }
    }

    return count;
  });
  readonly allVehicles = computed(
    () =>
      this.selectableVehicles().length > 0 &&
      this.selectedVehicleCount() === this.selectableVehicles().length,
  );
  readonly someVehicles = computed(() => this.selectedVehicleCount() > 0 && !this.allVehicles());
  readonly selectedVehicleList = computed(() => {
    const ids: string[] = [];

    for (const vehicle of this.vehicles) {
      if (this.selectedVehicles().has(vehicle.id)) {
        ids.push(vehicle.id);
      }
    }

    return ids.join(",");
  });
  readonly model = signal({ consent: false, updates: true, composed: false });
  readonly account = form(this.model, (path) => {
    required(path.consent, { message: "Accept the privacy policy to continue." });
    readonly(path.updates, () => this.frozen());
    disabled(path.updates, () => this.locked());
    required(path.composed);
    readonly(path.composed, () => this.composedFrozen());
    disabled(path.composed, () => this.composedLocked());
  });

  flip(value: boolean): boolean {
    return !value;
  }

  increment(value: number): number {
    return value + 1;
  }

  /** An updater appending one log entry, `name:value` when a value is given. */
  append(name: string, value?: boolean): (log: readonly string[]) => readonly string[] {
    let entry = name;

    if (value !== undefined) {
      entry = `${name}:${value}`;
    }

    return (log) => [...log, entry];
  }

  newslettersEntry(output: string, control: MixedConsentCheckbox): string {
    const checkbox = control.checkbox;

    return `${output}(checked:${checkbox.checked()},mixed:${checkbox.mixed()},value:${this.mixedAccount.newsletters().value()})`;
  }

  resetNewsletters(): void {
    this.mixedModel.update((model) => ({ ...model, newsletters: false }));
    this.newslettersMixed.set(true);
    this.newslettersLog.set([]);
  }

  async submitNewsletters(): Promise<void> {
    await submit(this.mixedAccount, async () => {});
  }

  replaceReminders(): void {
    this.mixedModel.update((model) => ({ ...model, reminders: false }));
  }

  selectVehicle(id: string, checked: boolean): void {
    const next = new Set(this.selectedVehicles());

    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }

    this.selectedVehicles.set(next);
  }

  selectAllVehicles(checked: boolean): void {
    const next = new Set(this.selectedVehicles());

    for (const id of this.selectableVehicles()) {
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }

    this.selectedVehicles.set(next);
  }

  writeConsent(): void {
    this.model.update((model) => ({ ...model, consent: !model.consent }));
  }

  writeComposed(): void {
    this.model.update((model) => ({ ...model, composed: !model.composed }));
  }

  async submitAccount(): Promise<void> {
    await submit(this.account, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}
