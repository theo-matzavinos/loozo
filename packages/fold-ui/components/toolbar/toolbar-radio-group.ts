import { Directive, computed, inject, input } from "@angular/core";
import { OrigamiToolbarRadioGroup, OrigamiToolbarState } from "@loozo/origami-ui/toolbar";
import { cn } from "../cn";

/** Fold RadioGroupItems as one Toolbar group: a row of one-line 32px radio rows, a column in a vertical Toolbar. */
@Directive({
  selector: "[fold__ToolbarRadioGroup]",
  hostDirectives: [
    {
      directive: OrigamiToolbarRadioGroup,
      inputs: ["value", "disabled"],
      outputs: ["valueChange"],
    },
  ],
  host: {
    "data-slot": "toolbar-radio-group",
    "[attr.data-orientation]": "orientation()",
    "[class]": "classes()",
  },
})
export class ToolbarRadioGroup {
  readonly class = input("");
  /** Origami puts no orientation on this root; the Toolbar's is mirrored for styling. */
  protected readonly orientation = inject(OrigamiToolbarState).orientation;
  protected readonly classes = computed(() =>
    cn(
      "flex items-center gap-4 data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-start",
      // Resets RadioGroup's looks, so an enclosing fold RadioGroup's invalid/readonly don't reach these items.
      "[--radio-invalid:initial] [--radio-readonly-border:initial] [--radio-readonly-ground:initial] [--radio-readonly-cursor:initial]",
      // Registers each row to the 32px toolbar line, one line tall and unshrunk, so the group moves
      // whole when the Toolbar wraps. Descendants include items inside a display: contents Tooltip.
      "**:data-[slot=radio-group-item]:h-8 **:data-[slot=radio-group-item]:shrink-0 **:data-[slot=radio-group-item]:whitespace-nowrap",
      this.class(),
    ),
  );
}
