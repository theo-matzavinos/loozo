import { Directive, Component } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverTrigger,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
} from "@loozo/origami-ui/popover";

/** V28: a composer that declares the token for the dialog its Popovers open. */
@Directive({
  selector: "button[dialogPopoverTrigger]",
  hostDirectives: [OrigamiPopoverTrigger],
  host: { "aria-haspopup": "dialog" },
})
export class DialogPopoverTrigger {}

/**
 * V28: the Trigger binds no `aria-haspopup`, so the token authored on a plain Trigger or a
 * composer's host is kept, and a Trigger whose Content has no popup role has none. Rendered on
 * the server so the case reads its HTML.
 */
@Component({
  selector: "acceptance-popover-has-popup",
  imports: [
    DialogPopoverTrigger,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  template: `
    <div ogPopover>
      <button
        ogPopoverTrigger
        ogPopoverAnchor
        aria-haspopup="dialog"
        data-testid="has-popup-authored-trigger"
      >
        Authored dialog
      </button>
      <div
        ogPopoverContent
        role="dialog"
        aria-label="Authored dialog"
        data-testid="has-popup-authored-content"
      >
        <input aria-label="Authored field" />
      </div>
    </div>
    <div ogPopover>
      <button dialogPopoverTrigger ogPopoverAnchor data-testid="has-popup-composer-trigger">
        Composed dialog
      </button>
      <div
        ogPopoverContent
        role="dialog"
        aria-label="Composed dialog"
        data-testid="has-popup-composer-content"
      >
        <input aria-label="Composed field" />
      </div>
    </div>
    <div ogPopover>
      <button ogPopoverTrigger ogPopoverAnchor data-testid="has-popup-group-trigger">Group</button>
      <div ogPopoverContent role="group" aria-label="Group" data-testid="has-popup-group-content">
        <input aria-label="Group field" />
      </div>
    </div>
  `,
})
export class PopoverHasPopup {}
