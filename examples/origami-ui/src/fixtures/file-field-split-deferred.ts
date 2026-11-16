import { Component } from "@angular/core";
import { FileFieldSplitFixture } from "./file-field-split.js";

@Component({
  selector: "acceptance-file-field-split-deferred",
  imports: [FileFieldSplitFixture],
  template: `
    @defer (hydrate on interaction) {
      <acceptance-file-field-split-fixture />
    } @placeholder {
      <p>Split file field fixture</p>
    }
  `,
})
export class FileFieldSplitDeferred {}
