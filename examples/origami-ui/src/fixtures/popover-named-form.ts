import { Component, signal } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

/**
 * V20: Popover Content holding forms whose controls are named like the members a flat-tree walk
 * reads, so each form's own `parentNode`, `assignedSlot` or `shadowRoot` is that control. Its
 * controls are script actions.
 */
@Component({
  selector: "acceptance-popover-named-form",
  imports: [OrigamiPopover, OrigamiPopoverTrigger, OrigamiPopoverAnchor, OrigamiPopoverContent],
  template: `
    <div ogPopover [(open)]="open">
      <button ogPopoverTrigger ogPopoverAnchor data-testid="named-form-trigger">Named forms</button>
      <div ogPopoverContent data-testid="named-form-content" role="group" aria-label="Named forms">
        <form>
          <input name="parentNode" data-testid="named-parent-node" aria-label="Parent node" />
        </form>
        <form>
          <input name="assignedSlot" data-testid="named-assigned-slot" aria-label="Assigned slot" />
        </form>
        <form>
          <input name="shadowRoot" data-testid="named-shadow-root" aria-label="Shadow root" />
        </form>
      </div>
    </div>
    <output data-testid="named-form-intent">{{ open() }}</output>
    <button type="button" data-testid="named-form-close" (click)="open.set(false)">Close</button>
  `,
})
export class PopoverNamedForm {
  readonly open = signal(false);
}
