import { Component } from "@angular/core";
import { PaginationFixture } from "./pagination.js";

@Component({
  selector: "acceptance-pagination-deferred",
  imports: [PaginationFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-pagination-fixture />
    } @placeholder {
      <p>Deferred pagination</p>
    }
  `,
})
export class PaginationDeferred {}
