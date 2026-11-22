import { Component, LOCALE_ID, computed, inject, input } from "@angular/core";
import { OrigamiFileFieldState } from "@loozo/origami-ui/file-field";
import { LucideFile } from "@lucide/angular";
import { cn } from "../cn";

const UNITS = ["B", "KB", "MB", "GB"];

/**
 * What counts as an extension to keep visible: up to 5 letters or digits after the last dot, as
 * `.pdf` or `.docx`. A longer one would leave the stem no room in a narrow row.
 */
const EXTENSION = /\.[\p{L}\p{N}]{1,5}$/u;

/**
 * Names in these scripts are split, as they run left to right: Latin, Greek and Cyrillic, with the
 * digits, punctuation and marks every script shares. A name with any other character is laid out
 * by the browser's bidirectional algorithm as one run, because a stem and an extension in separate
 * boxes can't be reordered together: `تقرير-final.pdf` would read `pdf.final`. Shared characters
 * that are right to left, such as the Arabic comma or the Indic Siyaq numbers, and the direction
 * marks and embeddings, aren't split either.
 */
const SPLITTABLE =
  /^[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Common}\p{Script=Inherited}]*$/u;
const RIGHT_TO_LEFT_OR_CONTROL =
  /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

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
 * FileField, with an optional FileFieldClear inside it, which ends the row 12px after the size. It
 * is at least 160px wide, so beside a button look in a narrow row it wraps under the button with
 * its Clear instead of squeezing the name; a FileField narrower than that overflows.
 */
@Component({
  selector: "[fold__FileFieldValue]",
  imports: [LucideFile],
  host: {
    "data-slot": "file-field-value",
    "[class]": "classes()",
    // The Clear's slot sits outside the @if, so the Clear keeps its element while the field is
    // empty and the host is never `:empty`: the native attribute hides it, which preflight makes
    // `!important`.
    "[attr.hidden]": "state.value() === null ? '' : null",
  },
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
    <span data-slot="file-field-clear-slot" class="ms-auto flex ps-1.5 empty:hidden"
      ><ng-content select="[fold__FileFieldClear]"
    /></span>
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

    if (
      extension === null ||
      extension.index === 0 ||
      !SPLITTABLE.test(name) ||
      RIGHT_TO_LEFT_OR_CONTROL.test(name)
    ) {
      return { stem: name, extension: "" };
    }

    return { stem: name.slice(0, extension.index), extension: extension[0] };
  });

  protected readonly size = computed(() => formatSize(this.state.value()?.size ?? 0, this.#format));

  protected readonly classes = computed(() =>
    cn(
      // The 6px gap plus the slot's 6px padding put the Clear 12px after the size; `ms-auto` ends
      // the row with it.
      "flex min-w-40 flex-1 items-center gap-1.5 text-body text-foreground",
      // Not on the host, which would dim a disabled Clear twice.
      "group-has-[input:disabled]/file-field:[&>:not([data-slot=file-field-clear-slot])]:opacity-50",
      "[&>[data-slot=file-field-value-icon]]:size-4 [&>[data-slot=file-field-value-icon]]:shrink-0 [&>[data-slot=file-field-value-icon]]:text-muted-foreground",
      this.class(),
    ),
  );
}
