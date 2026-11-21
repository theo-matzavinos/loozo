import { Component, computed, input } from "@angular/core";
import { OrigamiFileFieldDropZone } from "@loozo/origami-ui/file-field";
import { LucideCloudUpload } from "@lucide/angular";
import { cn } from "../cn";

/**
 * The drop-zone look of a FileField: a full-width dashed `<label>` around the FileFieldInput,
 * with an upload icon above your text. A click opens the picker natively, and a dropped file is
 * chosen as a picked one is. While a file drag is over it, Origami sets `data-drag-over` and its
 * border turns solid with a neutral tint.
 */
@Component({
  selector: "label[fold__FileFieldDropZone]",
  imports: [LucideCloudUpload],
  hostDirectives: [OrigamiFileFieldDropZone],
  host: { "data-slot": "file-field-drop-zone", "[class]": "classes()" },
  template: `
    <svg lucideCloudUpload aria-hidden="true" data-slot="file-field-drop-zone-icon"></svg>
    <ng-content />
  `,
})
export class FileFieldDropZone {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "relative flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-control border border-dashed border-input bg-surface px-4 py-6 text-center text-body text-muted-foreground",
      "transition-[border-color,background-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      // Every state border color is off in forced colors, so the Highlight drag-over border wins
      // there over focus, invalid and disabled.
      "not-forced-colors:hover:border-[color-mix(in_oklab,var(--input),var(--foreground)_35%)]",
      "data-drag-over:border-solid not-forced-colors:data-drag-over:border-foreground data-drag-over:bg-foreground/8",
      // No base outline-none, so the ring's outline-style stays solid.
      "has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring",
      "not-forced-colors:has-[input:focus-visible]:border-ring",
      "not-forced-colors:has-[input[aria-invalid=true]]:border-destructive-text",
      "has-[input:disabled]:cursor-not-allowed not-forced-colors:has-[input:disabled]:border-input has-[input:disabled]:opacity-50",
      "[&>[data-slot=file-field-drop-zone-icon]]:size-6 [&>[data-slot=file-field-drop-zone-icon]]:text-muted-foreground",
      "forced-colors:data-drag-over:border-[Highlight]",
      this.class(),
    ),
  );
}
