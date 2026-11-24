import { Component } from "@angular/core";
import { QueryFieldFixture } from "./query-field.js";

@Component({
  selector: "acceptance-query-field-deferred",
  imports: [QueryFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-query-field-fixture />
    } @placeholder {
      <p>Query field fixture</p>
    }
  `,
})
export class QueryFieldDeferred {}
