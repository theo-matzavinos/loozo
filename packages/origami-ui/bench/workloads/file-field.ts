import { Component, signal } from "@angular/core";
import {
  OrigamiFileField,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";

@Component({
  selector: "bench-root, bench-file-field",
  imports: [OrigamiFileField, OrigamiFileFieldInput, OrigamiFileFieldDropZone],
  template: `
    <div ogFileField [(value)]="file">
      <label ogFileFieldDropZone>
        Choose a file or drag it here
        <input ogFileFieldInput accept=".pdf,.png,.jpg" />
      </label>
    </div>
    <p>{{ file()?.name ?? "No file" }}</p>
  `,
})
export class Workload {
  readonly file = signal<File | null>(null);
}
