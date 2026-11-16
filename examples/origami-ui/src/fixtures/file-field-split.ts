import { Component, signal } from "@angular/core";
import { FormField, disabled, form, required } from "@angular/forms/signals";
import { OrigamiField, OrigamiFieldDescription, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import {
  OrigamiFileField,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";

// FF9: the root and its zone in the fixture's view, the Input in a child component inside its own
// hydrate boundary, and the Field's Label and Description in two sibling boundaries. Without
// incremental hydration the server renders the blocks' placeholders.

@Component({
  selector: "acceptance-file-field-split-input",
  imports: [OrigamiFileFieldInput],
  template: `<input ogFileFieldInput data-testid="split-input" />`,
})
export class FileFieldSplitInput {}

@Component({
  selector: "acceptance-file-field-split-locked-input",
  imports: [OrigamiFileFieldInput],
  template: `<input ogFileFieldInput aria-label="Locked attachment" data-testid="locked-input" />`,
})
export class FileFieldSplitLockedInput {}

@Component({
  selector: "acceptance-file-field-split-fixture",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFileField,
    OrigamiFileFieldDropZone,
    FileFieldSplitInput,
    FileFieldSplitLockedInput,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach split file field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <output data-testid="split-value">{{ attachment.file().value()?.name ?? "null" }}</output>
    <output data-testid="split-writes">{{ writes() }}</output>
    <output data-testid="split-touches">{{ touches() }}</output>
    <output data-testid="split-touched">{{ attachment.file().touched() }}</output>
    <button type="button" data-testid="split-hydrate-input" (click)="inputHydrated.set(true)">
      Hydrate the Input
    </button>
    <button
      type="button"
      data-testid="split-hydrate-description"
      (click)="descriptionHydrated.set(true)"
    >
      Hydrate the Description
    </button>
    <button type="button" data-testid="split-hydrate-label" (click)="labelHydrated.set(true)">
      Hydrate the Label
    </button>
    <button type="button" data-testid="split-unmount" (click)="inputMounted.set(false)">
      Remove the Input's block
    </button>
    <button type="button" data-testid="split-mount" (click)="inputMounted.set(true)">
      Mount the Input's block again
    </button>
    <button type="button" data-testid="split-write" (click)="write()">Write a file</button>

    <div ogField>
      @defer (hydrate when labelHydrated()) {
        <label ogFieldLabel id="split-label">Συνημμένο</label>
      } @placeholder {
        <p>Label</p>
      }
      @defer (hydrate when descriptionHydrated()) {
        <p ogFieldDescription id="split-description">PDF έως 10MB</p>
      } @placeholder {
        <p>Description</p>
      }
      <div
        ogFileField
        ogFileFieldDropZone
        [formField]="attachment.file"
        (valueChange)="writes.set(writes() + 1)"
        (touch)="touches.set(touches() + 1)"
        data-testid="split-root"
      >
        @if (inputMounted()) {
          @defer (hydrate when inputHydrated()) {
            <acceptance-file-field-split-input />
          } @placeholder {
            <p>Input</p>
          }
        }
      </div>
    </div>

    <div ogFileField [formField]="locked.file" data-testid="locked-root">
      @defer (hydrate when inputHydrated()) {
        <acceptance-file-field-split-locked-input />
      } @placeholder {
        <p>Locked Input</p>
      }
    </div>
  `,
})
export class FileFieldSplitFixture {
  readonly attached = signal(false);
  readonly labelHydrated = signal(false);
  readonly descriptionHydrated = signal(false);
  readonly inputHydrated = signal(false);
  readonly inputMounted = signal(true);
  readonly writes = signal(0);
  readonly touches = signal(0);
  readonly attachment = form(signal({ file: null as File | null }), (path) => {
    required(path.file);
  });
  readonly locked = form(signal({ file: null as File | null }), (path) => {
    disabled(path.file);
  });

  write(): void {
    this.attachment.file().value.set(new File(["abc"], "written.pdf", { type: "application/pdf" }));
  }
}
