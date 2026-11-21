import { Component, signal } from "@angular/core";
import { OrigamiOtpField, OrigamiOtpFieldInput } from "@loozo/origami-ui/otp-field";

@Component({
  selector: "bench-root, bench-otp-field",
  imports: [OrigamiOtpField, OrigamiOtpFieldInput],
  template: `
    <div ogOtpField #otp="ogOtpField" [(value)]="code">
      <input ogOtpFieldInput aria-label="Verification code" />
      <div aria-hidden="true">
        @for (cell of otp.state.cells(); track cell.index) {
          <span [class.caret]="cell.caret">{{ cell.char }}</span>
        }
      </div>
    </div>
    <p>Code: {{ code() || "none" }}</p>
  `,
})
export class Workload {
  readonly code = signal("");
}
