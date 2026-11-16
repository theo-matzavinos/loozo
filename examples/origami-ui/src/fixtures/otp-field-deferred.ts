import { Component } from "@angular/core";
import { OtpFieldFixture } from "./otp-field.js";

@Component({
  selector: "acceptance-otp-field-deferred",
  imports: [OtpFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-otp-field-fixture />
    } @placeholder {
      <p>OTP field fixture</p>
    }
  `,
})
export class OtpFieldDeferred {}
