import { Component, Directive, inject, signal } from "@angular/core";
import {
  FormField,
  disabled,
  email,
  form,
  readonly,
  required,
  submit,
} from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldControlOptions,
  OrigamiFieldDescription,
  OrigamiFieldDescriptionOptions,
  OrigamiFieldError,
  OrigamiFieldLabel,
  OrigamiFieldLabelOptions,
  OrigamiFieldState,
} from "@loozo/origami-ui/field";

/** A descendant reading the nearest Field's State through DI. */
@Directive({
  selector: "[fieldStateProbe]",
  host: {
    "[attr.data-errors-shown]": "state.errorsShown()",
    "[attr.data-touched]": "state.touched()",
    "[attr.data-error-kinds]": "kinds()",
  },
})
export class FieldStateProbe {
  readonly state = inject(OrigamiFieldState);

  kinds(): string {
    const kinds: string[] = [];

    for (const error of this.state.errors()) {
      kinds.push(error.kind);
    }

    return kinds.join(",");
  }
}

/** A consumer control composing FieldControl with factory Options over its exposed own `id`. */
@Directive({
  selector: "[factoryFieldControl]",
  hostDirectives: [{ directive: OrigamiFieldControl, inputs: ["id"] }],
  providers: [OrigamiFieldControlOptions.provideFactory(() => ({ id: inject(FieldIds).control }))],
})
export class FactoryFieldControl {}

/** A consumer label whose existing Options are a record of its own. */
@Directive({
  selector: "[existingFieldLabel]",
  hostDirectives: [{ directive: OrigamiFieldLabel, inputs: ["id"] }],
  providers: [OrigamiFieldLabelOptions.provideExisting(() => ExistingFieldLabel)],
})
export class ExistingFieldLabel {
  readonly id = inject(FieldIds).label;
}

/** A consumer description composing FieldDescription with factory Options. */
@Directive({
  selector: "[factoryFieldDescription]",
  hostDirectives: [{ directive: OrigamiFieldDescription, inputs: ["id"] }],
  providers: [
    OrigamiFieldDescriptionOptions.provideFactory(() => ({ id: inject(FieldIds).description })),
  ],
})
export class FactoryFieldDescription {}

/** A consumer control composing FieldControl whose own `host` writes a static `aria-describedby`. */
@Directive({
  selector: "[hintedFieldControl]",
  hostDirectives: [OrigamiFieldControl],
  host: { "aria-describedby": "composed-static" },
})
export class HintedFieldControl {}

/** A consumer label composing FieldLabel whose own `host` writes a static `for`. */
@Directive({
  selector: "[boundFieldLabel]",
  hostDirectives: [OrigamiFieldLabel],
  host: { for: "composed-for" },
})
export class BoundFieldLabel {}

/** Replacement IDs the composed consumer parts read; changed by the fixture's buttons. */
@Directive({ selector: "[fieldIds]", exportAs: "fieldIds" })
export class FieldIds {
  readonly control = signal("replaced-control");
  readonly label = signal("replaced-label");
  readonly description = signal("replaced-description");
}

@Component({
  selector: "acceptance-field-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldControl,
    OrigamiFieldDescription,
    OrigamiFieldError,
    FieldStateProbe,
    FieldIds,
    FactoryFieldControl,
    ExistingFieldLabel,
    FactoryFieldDescription,
    HintedFieldControl,
    BoundFieldLabel,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>M1 associations</h2>
      <div ogField data-testid="name-field">
        <label ogFieldLabel data-testid="name-label">Display name</label>
        <input
          ogFieldControl
          data-testid="name-control"
          aria-describedby="consumer-static"
          [id]="nameId()"
        />
        <p ogFieldDescription data-testid="name-description">Shown on your profile.</p>
      </div>
      <button type="button" data-testid="rename-control" (click)="nameId.set('renamed-name')">
        Rename the control
      </button>

      <div ogField data-testid="newsletter-field">
        <input ogFieldControl type="checkbox" id="newsletter" data-testid="newsletter-control" />
        <label ogFieldLabel id="newsletter-label" data-testid="newsletter-label">Newsletter</label>
      </div>

      <div ogField data-testid="country-field">
        <label ogFieldLabel data-testid="country-label">Country</label>
        <select ogFieldControl data-testid="country-control">
          <option>Greece</option>
          <option>Portugal</option>
        </select>
      </div>

      <div ogField data-testid="late-field">
        <label ogFieldLabel data-testid="late-label">Late control</label>
        @if (lateControl()) {
          <input ogFieldControl data-testid="late-control" />
        }
      </div>
      <button type="button" data-testid="toggle-late-control" (click)="lateControl.update(flip)">
        Toggle the late control
      </button>
    </section>

    <section>
      <h2>M2 descriptions and errors</h2>
      <div ogField data-testid="code-field">
        <label ogFieldLabel>Code</label>
        <input ogFieldControl data-testid="code-control" />
        <p ogFieldDescription id="code-first-description">Six digits.</p>
        @if (firstError()) {
          <p ogFieldError id="code-first-error">Too short.</p>
        }
        @if (secondError()) {
          <p ogFieldError id="code-second-error">Digits only.</p>
        }
        <p ogFieldDescription id="code-second-description">From your authenticator app.</p>
      </div>
      <button type="button" data-testid="toggle-first-error" (click)="firstError.update(flip)">
        Toggle the first error
      </button>
    </section>

    <section>
      <h2>M3 Signal Forms</h2>
      <div ogField #emailField="ogField" data-testid="email-field">
        <label ogFieldLabel data-testid="email-label">Email</label>
        <input
          ogFieldControl
          type="email"
          data-testid="email-control"
          [formField]="account.email"
        />
        <p ogFieldDescription id="email-description">We never share it.</p>
        @if (emailField.state.errorsShown()) {
          <p ogFieldError id="email-error" data-testid="email-error">
            {{ emailField.state.errors()[0]?.message }}
          </p>
        }
        <span fieldStateProbe data-testid="email-probe"></span>
      </div>
      <output data-testid="email-value">{{ model().email }}</output>
      <output data-testid="email-state"
        >{{ emailField.state.invalid() }} {{ emailField.state.touched() }}
        {{ emailField.state.required() }} {{ emailField.state.disabled() }}</output
      >

      <div ogField #nicknameField="ogField" data-testid="nickname-field">
        <label ogFieldLabel>Nickname</label>
        <input ogFieldControl data-testid="nickname-control" [formField]="account.nickname" />
        @if (nicknameField.state.errorsShown()) {
          <p ogFieldError id="nickname-error">Choose a nickname.</p>
        }
      </div>

      <div ogField #planField="ogField" data-testid="plan-field">
        <label ogFieldLabel>Plan</label>
        <select ogFieldControl data-testid="plan-control" [formField]="account.plan">
          <option value="basic">Basic</option>
          <option value="team">Team</option>
        </select>
      </div>
      <output data-testid="plan-value">{{ model().plan }}</output>

      <button type="button" data-testid="submit-account" (click)="submitAccount()">Submit</button>
      <button type="button" data-testid="lock-plan" (click)="locked.update(flip)">Lock plan</button>
      <button type="button" data-testid="freeze-nickname" (click)="frozen.update(flip)">
        Freeze nickname
      </button>
      <output data-testid="submits">{{ submits() }}</output>
    </section>

    <section>
      <h2>M4 cardinality, nesting and outside a Field</h2>
      <div ogField data-testid="outer-field">
        <label ogFieldLabel data-testid="outer-label">Outer</label>
        <input ogFieldControl data-testid="outer-control" />
        <div ogField data-testid="inner-field">
          <label ogFieldLabel data-testid="inner-label">Inner</label>
          <input ogFieldControl data-testid="inner-control" />
          <p ogFieldDescription id="inner-description">Inner hint.</p>
        </div>
        <p ogFieldDescription id="outer-description">Outer hint.</p>
        @if (duplicate()) {
          <input ogFieldControl data-testid="duplicate-control" />
        }
      </div>
      <button type="button" data-testid="mount-duplicate" (click)="duplicate.set(true)">
        Mount a second control
      </button>

      <label ogFieldLabel for="consumer-for" data-testid="outside-label">Outside</label>
      <input
        ogFieldControl
        id="outside-control"
        aria-describedby="outside-static"
        data-testid="outside-control"
      />
      <p ogFieldDescription id="outside-description">Outside hint.</p>

      <label boundFieldLabel data-testid="composed-outside-label">Composed outside</label>
      <input hintedFieldControl data-testid="composed-outside-control" />
    </section>

    <section fieldIds #ids="fieldIds">
      <h2>M5 Options replacement</h2>
      <div ogField data-testid="replaced-field">
        <label existingFieldLabel id="ignored-label" data-testid="replaced-label">Replaced</label>
        <input factoryFieldControl id="ignored-control" data-testid="replaced-control" />
        <p factoryFieldDescription id="ignored-description" data-testid="replaced-description">
          Replaced hint.
        </p>
      </div>
      <button
        type="button"
        data-testid="change-replaced-ids"
        (click)="
          ids.control.set('replaced-control-2');
          ids.label.set('replaced-label-2');
          ids.description.set('replaced-description-2')
        "
      >
        Change the replacement IDs
      </button>
    </section>
  `,
})
export class FieldFixture {
  readonly attached = signal(false);
  readonly nameId = signal("name");
  readonly lateControl = signal(false);
  readonly firstError = signal(true);
  readonly secondError = signal(true);
  readonly duplicate = signal(false);
  readonly locked = signal(false);
  readonly frozen = signal(false);
  readonly submits = signal(0);
  readonly model = signal({ email: "", nickname: "", plan: "basic" });
  readonly account = form(this.model, (path) => {
    required(path.email, { message: "Enter your email." });
    email(path.email, { message: "Enter a valid email." });
    required(path.nickname);
    readonly(path.nickname, () => this.frozen());
    disabled(path.plan, () => this.locked());
  });

  flip(value: boolean): boolean {
    return !value;
  }

  async submitAccount(): Promise<void> {
    await submit(this.account, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}
