import { Component, computed, input } from "@angular/core";
import { OrigamiAvatarFallback } from "@loozo/origami-ui/avatar";
import { cn } from "../cn";

/**
 * What the Avatar shows without a loaded image: your initials or icon, centered. Put it on an HTML
 * element, usually a `<span>`, and an icon inside it. While an image loads it stays transparent for
 * 600ms, so a fast photo doesn't flash the initials first.
 */
@Component({
  selector: "[fold__AvatarFallback]",
  hostDirectives: [OrigamiAvatarFallback],
  host: { "data-slot": "avatar-fallback", "[class]": "classes()" },
  template: `<ng-content />`,
  // Origami's fallback-delay recipe. CSS starts the clock when the element is first styled, so it
  // also runs in the server's HTML before hydration. Unlayered, so an ordinary animate-* class
  // doesn't override it; animate-none! does.
  styles: `
    :host-context([data-slot="avatar"][data-status="loading"]) {
      animation: avatar-fallback-delay 0s 600ms both;
    }

    @keyframes avatar-fallback-delay {
      from {
        opacity: 0;
      }
    }
  `,
})
export class AvatarFallback {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      // :not([hidden]), so fold's display never beats Origami's hidden.
      "col-start-1 row-start-1 size-full place-items-center [&:not([hidden])]:grid [&_svg]:size-[55%]",
      this.class(),
    ),
  );
}
