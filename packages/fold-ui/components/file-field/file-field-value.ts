import { Component, LOCALE_ID, computed, inject, input } from "@angular/core";
import { OrigamiFileFieldState } from "@loozo/origami-ui/file-field";
import { LucideFile } from "@lucide/angular";
import { cn } from "../cn";

const UNITS = ["B", "KB", "MB", "GB"];

/** `bytes` in 1024-based units up to GB, with one decimal at most and a no-break space. */
function formatSize(bytes: number, format: Intl.NumberFormat): string {
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${format.format(value)} ${UNITS[unit]}`;
}

/**
 * The chosen file's name and size, after a file icon; nothing while no file is chosen. A long name
 * truncates before its extension, with the full name in `title`. The size is in 1024-based units,
 * formatted in your app's `LOCALE_ID`: `1.5 KB`, or `1,5 KB` in Greek. Write it inside the
 * FileField.
 */
@Component({
  selector: "[fold__FileFieldValue]",
  imports: [LucideFile],
  host: { "data-slot": "file-field-value", "[class]": "classes()" },
  template: `
    @if (state.value(); as file) {
      <svg lucideFile aria-hidden="true" data-slot="file-field-value-icon"></svg>
      <span data-slot="file-field-name" class="flex min-w-0" [title]="file.name"
        ><span class="truncate">{{ name().stem }}</span
        ><span class="shrink-0">{{ name().extension }}</span></span
      >
      <span data-slot="file-field-size" class="shrink-0 tabular-nums text-muted-foreground">{{
        size()
      }}</span>
    }
  `,
})
export class FileFieldValue {
  readonly class = input("");

  protected readonly state = inject(OrigamiFileFieldState);

  readonly #format = new Intl.NumberFormat(inject(LOCALE_ID), { maximumFractionDigits: 1 });

  /** The name split before its last dot, unless that's its first character, as in `.env`. */
  protected readonly name = computed(() => {
    const name = this.state.value()?.name ?? "";
    const dot = name.lastIndexOf(".");

    if (dot <= 0) {
      return { stem: name, extension: "" };
    }

    return { stem: name.slice(0, dot), extension: name.slice(dot) };
  });

  protected readonly size = computed(() => formatSize(this.state.value()?.size ?? 0, this.#format));

  protected readonly classes = computed(() =>
    cn(
      "flex min-w-0 flex-1 items-center gap-1.5 text-body text-foreground empty:hidden",
      "group-has-[input:disabled]/file-field:opacity-50",
      "[&>[data-slot=file-field-value-icon]]:size-4 [&>[data-slot=file-field-value-icon]]:shrink-0 [&>[data-slot=file-field-value-icon]]:text-muted-foreground",
      this.class(),
    ),
  );
}
