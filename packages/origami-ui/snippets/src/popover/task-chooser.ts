import { Component, input, model } from "@angular/core";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
  type OrigamiPopoverAlign,
  type OrigamiPopoverSide,
} from "@loozo/origami-ui/popover";

@Component({
  selector: "app-task-chooser",
  imports: [OrigamiPopover, OrigamiPopoverTrigger, OrigamiPopoverAnchor, OrigamiPopoverContent],
  template: `
    <div ogPopover [(open)]="open">
      <button ogPopoverTrigger ogPopoverAnchor>Choose task</button>
      <div
        ogPopoverContent
        #content="ogPopoverContent"
        [side]="side()"
        [align]="align()"
        [gap]="gap()"
        class="chooser"
        role="group"
        aria-label="Tasks"
      >
        @if (content.state.open()) {
          <button type="button">Review</button>
          <button type="button">Archive</button>
        }
      </div>
    </div>
  `,
  styles: `
    .chooser {
      inline-size: 16rem;
      max-block-size: 10rem;
      box-sizing: border-box;
      overflow: auto;
    }

    .chooser:popover-open {
      display: grid;
      gap: 0.25rem;
    }

    .chooser[data-entering] {
      animation: pop 120ms ease-out;
    }

    .chooser[data-leaving] {
      animation: pop 120ms ease-in reverse;
    }

    @keyframes pop {
      from {
        opacity: 0;
        scale: 0.96;
      }
    }
  `,
})
export class TaskChooser {
  readonly open = model(false);
  readonly side = input<OrigamiPopoverSide>("block-end");
  readonly align = input<OrigamiPopoverAlign>("start");
  readonly gap = input(8);
}
