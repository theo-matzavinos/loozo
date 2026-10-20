import { Component, signal } from "@angular/core";
import { FormField, email, form, required } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldControl,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";

// Signal Forms owns the value and validation; the Field wires the label, hint and error to the input.
@Component({
  selector: "app-signup-email",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldControl,
    OrigamiFieldDescription,
    OrigamiFieldError,
  ],
  template: `
    <div ogField #field="ogField" class="stack">
      <label ogFieldLabel>Email</label>
      <input ogFieldControl type="email" [formField]="signup.email" />
      <p ogFieldDescription>We only use it to send your receipt.</p>
      @if (field.state.errorsShown()) {
        <p ogFieldError>{{ field.state.errors()[0]?.message }}</p>
      }
    </div>
  `,
})
export class SignupEmail {
  readonly model = signal({ email: "" });
  readonly signup = form(this.model, (path) => {
    required(path.email, { message: "Enter your email." });
    email(path.email, { message: "Enter a valid email address." });
  });
}
