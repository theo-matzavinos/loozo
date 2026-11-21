import { Component, signal } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogDescription,
  OrigamiDialogTitle,
  OrigamiDialogTrigger,
} from "@loozo/origami-ui/dialog";

@Component({
  selector: "bench-root, bench-dialog",
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
      <dialog ogDialogContent>
        <h2 ogDialogTitle>Filters</h2>
        <p ogDialogDescription>Narrow the task list.</p>
        <button ogDialogClose autofocus>Done</button>
      </dialog>
    </div>
  `,
})
export class Workload {
  readonly open = signal(false);
}
