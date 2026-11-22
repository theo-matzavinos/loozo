import { Component, input, signal } from "@angular/core";
import { FormField, disabled, form, required, validate } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import {
  OrigamiFileField,
  OrigamiFileFieldClear,
  OrigamiFileFieldDropZone,
  OrigamiFileFieldInput,
} from "@loozo/origami-ui/file-field";

const MB = 1024 * 1024;

// A document attached with a comment, as one Signal Form. The drop zone is the label, so a click
// anywhere on it opens the native picker; the input stays focusable but visually hidden. Size is
// the form's rule, not the input's `accept`. Uploading is the application's job: Attach hands the
// file over and resets the form with its values, which also clears the native input. Remove
// empties the field and moves focus back to the input; it sits inside the field, outside the label.
@Component({
  selector: "app-attach-document",
  imports: [
    FormField,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiFileField,
    OrigamiFileFieldInput,
    OrigamiFileFieldDropZone,
    OrigamiFileFieldClear,
  ],
  template: `
    <div ogField #field="ogField" class="stack">
      <div ogFileField [formField]="attachment.file" #picker="ogFileField" class="stack">
        <label ogFieldLabel ogFileFieldDropZone class="zone">
          <span class="button">Choose a file</span> or drag it here
          <input ogFileFieldInput class="visually-hidden" accept=".pdf,.png,.jpg" />
        </label>
        @if (picker.state.value(); as file) {
          <p class="chosen">
            {{ file.name }}
            <button ogFileFieldClear aria-label="Remove the document">Remove</button>
          </p>
        }
      </div>
      <p ogFieldDescription>PDF, PNG or JPG, up to 10 MB</p>
      @if (field.state.errorsShown()) {
        @switch (field.state.errors()[0]?.kind) {
          @case ("required") {
            <p ogFieldError>Choose a document</p>
          }
          @case ("fileTooLarge") {
            <p ogFieldError>The document is larger than 10 MB</p>
          }
        }
      }
    </div>
    <label class="stack">
      Comment
      <textarea [formField]="attachment.comment"></textarea>
    </label>
    <p class="actions">
      <button type="button" (click)="cancel()">Cancel</button>
      <button type="button" [disabled]="attachment().invalid()" (click)="attach()">Attach</button>
    </p>
    <p>Attached: {{ attached() }}</p>
  `,
  styles: `
    .stack {
      display: grid;
      gap: 0.25rem;
    }

    .zone {
      display: block;
      padding: 1.5rem;
      border: 2px dashed var(--border, currentColor);
      border-radius: 8px;
      cursor: pointer;
    }

    .zone[data-drag-over] {
      border-color: var(--focus, Highlight);
    }

    .zone:has(:focus-visible) {
      outline: 2px solid var(--focus, Highlight);
      outline-offset: 2px;
    }

    .button {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border: 1px solid var(--border, currentColor);
      border-radius: 4px;
    }

    .visually-hidden {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .chosen {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }
  `,
})
export class AttachDocument {
  readonly disabled = input(false);

  readonly model = signal<{ file: File | null; comment: string }>({ file: null, comment: "" });
  readonly attachment = form(this.model, (path) => {
    required(path.file);
    validate(path.file, ({ value }) => {
      const file = value();

      if (file !== null && file.size > 10 * MB) {
        return { kind: "fileTooLarge" };
      }

      return undefined;
    });
    disabled(path.file, () => this.disabled());
  });
  readonly attached = signal("nothing yet");

  attach(): void {
    const { file, comment } = this.model();

    this.attached.set(`${file?.name ?? "no file"}${comment === "" ? "" : `, “${comment}”`}`);
    this.cancel();
  }

  /** A bare `reset()` would keep the file: pass the values, which also clears the native input. */
  cancel(): void {
    this.attachment().reset({ file: null, comment: "" });
  }
}
