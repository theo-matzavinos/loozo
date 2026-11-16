import { Component } from "@angular/core";
import { FileFieldFixture } from "./file-field.js";

@Component({
  selector: "acceptance-file-field-deferred",
  imports: [FileFieldFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-file-field-fixture />
    } @placeholder {
      <p>File field fixture</p>
    }
  `,
})
export class FileFieldDeferred {}
