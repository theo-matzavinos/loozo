import { Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { injectRoute } from "./route.generated.js";

@Component({
  imports: [RouterLink],
  template: `
    <p id="chat-rest">
      Unknown chat <span id="chat-rest-path">{{ route.params().rest.join("/") }}</span>
      <a id="chat-rest-close" [routerLink]="route.link({ close: true })">Close</a>
    </p>
  `,
})
export default class ChatRest {
  readonly route = injectRoute();
}
