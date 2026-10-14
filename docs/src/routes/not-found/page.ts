import { Component } from "@angular/core";
import { NotFound } from "../../not-found.js";

@Component({
  imports: [NotFound],
  template: `
    <main id="main" tabindex="-1" class="page">
      <docs-not-found />
    </main>
  `,
})
export default class NotFoundPage {}
