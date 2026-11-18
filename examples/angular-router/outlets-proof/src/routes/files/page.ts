import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  imports: [RouterOutlet],
  template: `<section id="chat-files"><router-outlet /></section>`,
})
export default class ChatFiles {}
