import { Component, signal } from "@angular/core";
import {
  OrigamiFileField,
  OrigamiFileFieldClear,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";

@Component({
  selector: "bench-root, bench-file-field",
  imports: [
    OrigamiFileField,
    OrigamiFileFieldInput,
    OrigamiFileFieldDropZone,
    OrigamiFileFieldClear,
  ],
  template: `
    <div ogFileField [(value)]="file">
      <label ogFileFieldDropZone>
        Choose a file or drag it here
        <input ogFileFieldInput accept=".pdf,.png,.jpg" />
      </label>
      @if (file(); as chosen) {
        <p>{{ chosen.name }}</p>
        <button ogFileFieldClear aria-label="Remove file">×</button>
      } @else {
        <p>No file</p>
      }
    </div>
  `,
})
export class Workload {
  readonly file = signal<File | null>(null);
}
