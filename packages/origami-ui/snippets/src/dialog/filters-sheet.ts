import { Component, signal } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogDescription,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";

// A sheet is a Dialog styled against the inline-end edge; it slides in and out with Presence.
@Component({
  selector: "app-filters-sheet",
  imports: [
    OrigamiDialog,
    OrigamiDialogTrigger,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogDescription,
    OrigamiDialogClose,
  ],
  template: `
    <div ogDialog [(open)]="open">
      <button ogDialogTrigger>Filters</button>
      <dialog ogDialogContent class="sheet">
        <h2 ogDialogTitle>Filters</h2>
        <p ogDialogDescription>Narrow the task list.</p>
        <label><input type="checkbox" /> Only my tasks</label>
        <button ogDialogClose autofocus>Done</button>
      </dialog>
    </div>
  `,
  styles: `
    .sheet {
      box-sizing: border-box;
      margin-inline: auto 0;
      margin-block: 0;
      block-size: 100dvh;
      max-block-size: none;
      inline-size: min(20rem, 100vw);
      max-inline-size: none;
      padding: 1rem;
      border: none;
      border-inline-start: 1px solid currentColor;
      color: inherit;
      background: var(--surface, Canvas);
    }

    .sheet::backdrop {
      background: rgb(0 0 0 / 0.4);
    }

    .sheet[data-entering] {
      animation: slide 200ms ease-out;
    }

    .sheet[data-leaving] {
      animation: slide 200ms ease-in reverse forwards;
    }

    @keyframes slide {
      from {
        translate: 100% 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .sheet[data-entering],
      .sheet[data-leaving] {
        animation: none;
      }
    }
  `,
})
export class FiltersSheet {
  readonly open = signal(false);
}
