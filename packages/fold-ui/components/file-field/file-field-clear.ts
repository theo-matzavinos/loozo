import { Component, computed, inject, input } from "@angular/core";
import { OrigamiFileFieldClear, OrigamiFileFieldState } from "@loozo/origami-ui/file-field";
import { LucideX } from "@lucide/angular";
import { buttonVariants } from "../button";
import { cn } from "../cn";

/**
 * A 32px ghost × that empties its FileField through Origami's File field Clear and moves focus to
 * the FileFieldInput. It's hidden while no file is chosen. Name it with `aria-label`, such as
 * `aria-label="Remove the invoice"`, and write it inside the FileFieldValue, which ends its row
 * with it 12px after the size and keeps it beside the name when the row wraps. It's disabled and
 * dimmed while the field is disabled.
 */
@Component({
  selector: "button[fold__FileFieldClear]",
  imports: [LucideX],
  hostDirectives: [OrigamiFileFieldClear],
  host: {
    "data-slot": "file-field-clear",
    "[class]": "classes()",
    // The native attribute, which preflight hides with `!important`, so a responsive display
    // class such as `md:inline-flex` can't show an empty field's Clear.
    "[attr.hidden]": "state.value() === null ? '' : null",
  },
  template: `<svg lucideX aria-hidden="true"></svg>`,
})
export class FileFieldClear {
  readonly class = input("");

  protected readonly state = inject(OrigamiFileFieldState);

  protected readonly classes = computed(() =>
    buttonVariants({
      variant: "ghost",
      size: "icon",
      // The negative margins leave a 16px margin box, shorter than the value's line, so the
      // value stays 8px under a drop zone.
      class: cn(
        "-my-2 text-muted-foreground not-data-disabled:hover:text-foreground",
        this.class(),
      ),
    }),
  );
}
