import { Component } from "@angular/core";
import { injectRoute } from "./route.generated.js";

@Component({
  template: `<p id="chat-files-path">{{ route.params().rest.join("/") }}</p>`,
})
export default class ChatFilesRest {
  readonly route = injectRoute();
}
