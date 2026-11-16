import { Component, computed, input } from "@angular/core";
import { OrigamiSwitch } from "@loozo/origami-ui/switch";
import { cn } from "../cn";

/**
 * A 36×20 switch over Origami's Switch. It's the track only and projects no content, so name it
 * with a Field `<label>` or with `aria-label`.
 *
 * @example
 * ```html
 * <div fold__Field orientation="horizontal">
 *   <button fold__Switch [formField]="form.autoRenew"></button>
 *   <label fold__FieldLabel>Renew automatically</label>
 * </div>
 * ```
 */
@Component({
  selector: "button[fold__Switch]",
  hostDirectives: [
    {
      directive: OrigamiSwitch,
      inputs: ["checked", "disabled", "focusableWhenDisabled", "id"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  host: { "data-slot": "switch", "[class]": "classes()" },
  template: `<span
    data-slot="switch-thumb"
    aria-hidden="true"
    class="size-3.5 rounded-full bg-foreground opacity-75 transition-[translate,background-color,opacity] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0 group-data-checked/switch:translate-x-4 group-data-checked/switch:bg-background group-data-checked/switch:opacity-100 rtl:group-data-checked/switch:-translate-x-4"
  ></span>`,
})
export class Switch {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn(
      "group/switch inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-input bg-[color-mix(in_oklab,var(--foreground)_10%,var(--surface))] px-0.5",
      "transition-[background-color,border-color] duration-120 ease-out motion-reduce:transition-none motion-reduce:duration-0",
      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
      // Aria variants sort before data ones, so the checked border yields to the invalid one here.
      "data-checked:bg-foreground not-aria-invalid:data-checked:border-foreground",
      "aria-invalid:border-destructive-text",
      "aria-readonly:cursor-default aria-readonly:border-dashed aria-readonly:bg-transparent",
      "data-disabled:cursor-not-allowed data-disabled:opacity-50",
      this.class(),
    ),
  );
}
