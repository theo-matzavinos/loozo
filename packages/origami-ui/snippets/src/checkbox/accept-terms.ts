import { Component, signal } from "@angular/core";
import { FormField, form, required, submit } from "@angular/forms/signals";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { OrigamiField, OrigamiFieldError, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// Signal Forms owns the value; the Checkbox joins the Field, whose Label names it and toggles it.
@Component({
  selector: "app-accept-terms",
  imports: [FormField, OrigamiCheckbox, OrigamiField, OrigamiFieldLabel, OrigamiFieldError],
  template: `
    <div ogField #field="ogField">
      <div class="row">
        <button ogCheckbox class="box" [formField]="signup.terms"></button>
        <label ogFieldLabel>I accept the terms</label>
      </div>
      @if (field.state.errorsShown()) {
        <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
      }
    </div>
    <button type="button" (click)="createAccount()">Create account</button>
    @if (created()) {
      <p>Account created.</p>
    }
  `,
  styles: `
    .row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .box {
      inline-size: 1.25rem;
      block-size: 1.25rem;
      padding: 0;
      border: 1px solid currentColor;
      border-radius: 4px;
      background: none;
      color: inherit;
    }

    .box[data-checked] {
      background: var(--accent);
    }

    .box[data-checked]::after {
      content: "✓";
    }
  `,
})
export class AcceptTerms {
  readonly model = signal({ terms: false });
  readonly created = signal(false);
  readonly signup = form(this.model, (path) => {
    required(path.terms, { message: "Accept the terms to create an account." });
  });

  async createAccount(): Promise<void> {
    await submit(this.signup, async () => {
      this.created.set(true);
    });
  }
}
