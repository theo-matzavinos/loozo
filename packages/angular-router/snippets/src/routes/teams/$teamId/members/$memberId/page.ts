import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `<h1>Member {{ route.params().memberId }} of team {{ route.params().teamId }}</h1>`,
})
export default class Member {
  readonly route = injectRoute();
}
