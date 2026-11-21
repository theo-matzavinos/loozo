import { Component, signal } from "@angular/core";
import { OrigamiAvatar, OrigamiAvatarFallback, OrigamiAvatarImage } from "@loozo/origami-ui/avatar";

@Component({
  selector: "bench-root, bench-avatar",
  imports: [OrigamiAvatar, OrigamiAvatarImage, OrigamiAvatarFallback],
  template: `
    <span ogAvatar #avatar="ogAvatar" role="img" aria-label="Ada Lovelace">
      <span ogAvatarFallback aria-hidden="true">AL</span>
      <img ogAvatarImage [src]="src()" alt="" />
    </span>
    <p>Status: {{ avatar.state.status() }}</p>
  `,
})
export class Workload {
  readonly src = signal<string | null>("/avatar.png");
}
