import { Component, Directive, inject, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import { OrigamiSwitch, OrigamiSwitchOptions, OrigamiSwitchState } from "@loozo/origami-ui/switch";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

/** A descendant of the button reading its Switch State through DI. */
@Directive({
  selector: "[switchStateProbe]",
  host: {
    "[attr.data-checked-state]": "state.checked()",
    "[attr.data-disabled-state]": "state.disabled()",
  },
})
export class SwitchStateProbe {
  readonly state = inject(OrigamiSwitchState);
}

/**
 * The falsifier: a consumer component that is the Switch through `hostDirectives`, exposing
 * the model, `disabled` and `touch`, so `[formField]` on it finds the Switch's model.
 */
@Component({
  selector: "button[consentSwitch]",
  hostDirectives: [
    {
      directive: OrigamiSwitch,
      inputs: ["checked", "disabled"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  template: `<span class="box" aria-hidden="true"></span>`,
})
export class ConsentSwitch {}

/** Replacement Options state the composed Switches read; changed by the fixture's buttons. */
@Directive({ selector: "[switchSettings]", exportAs: "switchSettings" })
export class SwitchSettings {
  readonly checked = signal(true);
  readonly disabled = signal(false);
  readonly focusable = signal(false);
  readonly id = signal("replaced-switch");
}

/** A consumer Switch with factory Options over its exposed own inputs and model output. */
@Directive({
  selector: "button[factorySwitch]",
  hostDirectives: [
    { directive: OrigamiSwitch, inputs: ["checked", "disabled", "id"], outputs: ["checkedChange"] },
  ],
  providers: [
    OrigamiSwitchOptions.provideFactory(() => {
      const settings = inject(SwitchSettings);

      return {
        checked: settings.checked,
        disabled: settings.disabled,
        focusableWhenDisabled: settings.focusable,
        id: settings.id,
      };
    }),
  ],
})
export class FactorySwitch {}

/** A consumer Switch whose existing Options are its own record. */
@Directive({
  selector: "button[existingSwitch]",
  hostDirectives: [OrigamiSwitch],
  providers: [OrigamiSwitchOptions.provideExisting(() => ExistingSwitch)],
})
export class ExistingSwitch implements OrigamiSwitchOptions {
  readonly checked = signal(false);
  readonly disabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
  readonly id = signal("existing-switch");
}

@Component({
  selector: "acceptance-switch-fixture",
  imports: [
    FormField,
    OrigamiSwitch,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    SwitchStateProbe,
    ConsentSwitch,
    SwitchSettings,
    FactorySwitch,
    ExistingSwitch,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach switch behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Standalone</h2>
      <button
        ogSwitch
        #remember="ogSwitch"
        data-testid="standalone"
        aria-label="Remember me"
        aria-describedby="standalone-hint"
        [(checked)]="remembered"
        (checkedChange)="outputs.update(increment)"
      >
        <span switchStateProbe data-testid="standalone-probe"></span>
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
        ogSwitch
        data-testid="disabled"
        aria-label="Disabled"
        [disabled]="true"
        [(checked)]="disabledChecked"
      ></button>
      <button
        ogSwitch
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
          ogSwitch
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
        <button ogSwitch id="subscribe" data-testid="subscribe"></button>
        <label ogFieldLabel data-testid="subscribe-label">Subscribe to the newsletter</label>
      </div>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #consentField="ogField" data-testid="consent-field">
        <label ogFieldLabel>I agree to the privacy policy</label>
        <button ogSwitch data-testid="consent" [formField]="account.consent"></button>
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
        <button ogSwitch data-testid="updates" [formField]="account.updates"></button>
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
        <button consentSwitch data-testid="composed" [formField]="account.composed"></button>
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

    <section switchSettings #settings="switchSettings">
      <h2>Options replacement</h2>
      <div ogField>
        <label ogFieldLabel data-testid="replaced-label">Replaced</label>
        <button
          factorySwitch
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
      <button type="button" data-testid="rename-replaced" (click)="settings.id.set('replaced-switch-2')">
        Rename the replaced control
      </button>
      <button existingSwitch data-testid="existing" aria-label="Existing"></button>
    </section>
  `,
})
export class SwitchFixture {
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
