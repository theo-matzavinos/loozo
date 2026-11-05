import { Component } from "@angular/core";

// Where `session.current` sends visitors without a user. The test-only identity is a cookie.
@Component({
  selector: "launch-sign-in",
  template: `<h1 id="sign-in-title">Sign in</h1>
    <p>Set the test-only <code>proof-user=alice</code> or <code>proof-user=bob</code> cookie.</p>`,
})
export default class SignIn {}
