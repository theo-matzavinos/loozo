import { Component, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
@Component({
  selector: "launch-uncached",
  template: `<h1>Uncached identity</h1>
    <p id="uncached">{{ snapshot.user }}</p>`,
})
export default class Uncached {
  readonly snapshot: { user: string } = inject(ActivatedRoute).snapshot.data["todos"];
}
