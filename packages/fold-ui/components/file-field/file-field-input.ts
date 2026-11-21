import { Directive, computed, input } from "@angular/core";
import { OrigamiFileFieldInput } from "@loozo/origami-ui/file-field";
import { cn } from "../cn";

/**
 * The native file input inside a FileFieldButton or FileFieldDropZone: visually hidden, still
 * focusable, and the field's one control. Origami makes it `type="file"`; add `accept` as a hint
 * to the picker. Origami reads its `id` as a static attribute: write `id="…"` or let a Field
 * generate one, not `[id]`.
 */
@Directive({
  selector: "input[fold__FileFieldInput]",
  hostDirectives: [OrigamiFileFieldInput],
  host: { "data-slot": "file-field-input", "[class]": "classes()" },
})
export class FileFieldInput {
  readonly class = input("");

  protected readonly classes = computed(() => cn("sr-only", this.class()));
}
