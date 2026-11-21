import { Directive, computed, input } from "@angular/core";
import { OrigamiAvatarImage } from "@loozo/origami-ui/avatar";
import { cn } from "../cn";

/**
 * The Avatar's photo, a native `<img>` filling the avatar. `alt` and every other attribute are
 * yours; Origami hides it while there's no source or it failed.
 */
@Directive({
  selector: "img[fold__AvatarImage]",
  hostDirectives: [{ directive: OrigamiAvatarImage, inputs: ["src"] }],
  host: { "data-slot": "avatar-image", "[class]": "classes()" },
})
export class AvatarImage {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "col-start-1 row-start-1 size-full object-cover",
      // An opaque backdrop only once loaded: a transparent photo then doesn't show the fallback
      // through it, and the backdrop never covers the fallback while the photo loads.
      "[[data-status=loaded]>&]:bg-surface",
      this.class(),
    ),
  );
}
