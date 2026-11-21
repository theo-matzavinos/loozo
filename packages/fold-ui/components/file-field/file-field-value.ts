import { Component, LOCALE_ID, computed, inject, input } from "@angular/core";
import { OrigamiFileFieldState } from "@loozo/origami-ui/file-field";
import { LucideFile } from "@lucide/angular";
import { cn } from "../cn";

const UNITS = ["B", "KB", "MB", "GB"];

/** What counts as an extension to keep visible: up to 10 letters or digits after the last dot. */
const EXTENSION = /\.[\p{L}\p{N}]{1,10}$/u;

/**
 * Names in these scripts are split, as they run left to right: Latin, Greek and Cyrillic, with the
 * digits, punctuation and marks every script shares. A name with any other character is laid out
 * by the browser's bidirectional algorithm as one run, because a stem and an extension in separate
 * boxes can't be reordered together: `تقرير-final.pdf` would read `pdf.final`.
 */
const SPLITTABLE =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]*$/u;

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
 * truncates before its extension, with the full name in `title`; a name in a script other than
 * Latin, Greek or Cyrillic truncates as a whole, in its own direction. The size is in 1024-based units,
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
      @if (name().extension) {
        <span data-slot="file-field-name" dir="ltr" class="flex min-w-0" [title]="file.name"
          ><span class="truncate">{{ name().stem }}</span
          ><span class="max-w-full shrink-0 truncate">{{ name().extension }}</span></span
        >
      } @else {
        <span data-slot="file-field-name" dir="auto" class="min-w-0 truncate" [title]="file.name">{{
          file.name
        }}</span>
      }
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

  /**
   * The name split before a short extension, which stays visible while the stem truncates. A name
   * that is only an extension, as `.env`, whose last dot starts something longer or with spaces, as
   * `notes.final version`, or in another script isn't split: it truncates as a whole.
   */
  protected readonly name = computed(() => {
    const name = this.state.value()?.name ?? "";
    const extension = EXTENSION.exec(name);

    if (extension === null || extension.index === 0 || !SPLITTABLE.test(name)) {
      return { stem: name, extension: "" };
    }

    return { stem: name.slice(0, extension.index), extension: extension[0] };
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
