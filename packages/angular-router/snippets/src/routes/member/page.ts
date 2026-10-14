import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `
    @if (route.params.hasValue()) {
      <h1>Member {{ route.params.value().memberId }} of team {{ route.params.value().teamId }}</h1>
    }
  `,
})
export default class Member {
  readonly route = injectRoute();
}
