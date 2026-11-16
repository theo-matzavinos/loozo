import { Component, signal } from "@angular/core";
import {
  OrigamiFileField,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";

// FF11: the README's page guard, installed through this component's document listeners, so it
// exists only while this route is mounted, next to a zone field and a plain native file input.

@Component({
  selector: "acceptance-file-field-guarded-fixture",
  host: {
    "(document:dragover)": "guard($event)",
    "(document:drop)": "guard($event)",
  },
  imports: [OrigamiFileField, OrigamiFileFieldDropZone, OrigamiFileFieldInput],
  styles: `
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .zone,
    .native,
    .outside {
      display: block;
      box-sizing: border-box;
      width: 420px;
      margin: 16px 0;
      padding: 16px;
      border: 2px dashed #94a3b8;
    }
    .native input {
      display: block;
      width: 380px;
      height: 60px;
    }
    .outside {
      height: 80px;
      background: #252a31;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach guarded file field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <output data-testid="guarded-value">{{ value()?.name ?? "null" }}</output>
    <div ogFileField [(value)]="value">
      <label ogFileFieldDropZone class="zone" data-testid="guarded-zone">
        Choose a file or drag it here
        <input ogFileFieldInput class="sr-only" data-testid="guarded-input" />
      </label>
    </div>

    <output data-testid="native-changes">{{ nativeChanges() }}</output>
    <output data-testid="native-name">{{ nativeName() }}</output>
    <label class="native">
      A plain native file input
      <input type="file" data-testid="native-input" (change)="nativeChanged($event)" />
    </label>

    <div class="outside" data-testid="guarded-outside">Outside every zone and input</div>
  `,
})
export class FileFieldGuardedFixture {
  readonly attached = signal(false);
  readonly value = signal<File | null>(null);
  readonly nativeChanges = signal(0);
  readonly nativeName = signal("null");

  /** The README recipe: a missed file drop opens nothing, while native file inputs keep theirs. */
  guard(event: DragEvent): void {
    const target = event.target;

    if (target instanceof HTMLInputElement && target.type === "file") {
      return;
    }

    if (event.dataTransfer?.types.includes("Files")) {
      event.preventDefault();
    }
  }

  nativeChanged(event: Event): void {
    const input = event.target as HTMLInputElement;

    this.nativeChanges.update((count) => count + 1);
    this.nativeName.set(input.files?.[0]?.name ?? "null");
  }
}
