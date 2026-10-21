import { Component, signal } from "@angular/core";
import { FormField, disabled, form, readonly, required, submit } from "@angular/forms/signals";
import {
  OrigamiField,
  OrigamiFieldDescription,
  OrigamiFieldError,
  OrigamiFieldLabel,
} from "@loozo/origami-ui/field";
import { OrigamiToggle } from "@loozo/origami-ui/toggle";
import { OrigamiToggleGroupItem, OrigamiToggleGroupSingle } from "@loozo/origami-ui/toggle-group";
import { OrigamiToolbar, OrigamiToolbarToggle } from "@loozo/origami-ui/toolbar";

/**
 * The falsifier: a consumer component that is the Toggle through `hostDirectives`, exposing the
 * model, `disabled` and `touch`, so `[formField]` on it finds the Toggle's model.
 */
@Component({
  selector: "button[formatToggle]",
  hostDirectives: [
    {
      directive: OrigamiToggle,
      inputs: ["checked", "disabled"],
      outputs: ["checkedChange", "touch"],
    },
  ],
  template: `<span class="icon" aria-hidden="true">U</span>`,
})
export class FormatToggle {}

@Component({
  selector: "acceptance-toggle-fixture",
  imports: [
    FormField,
    OrigamiToggle,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldDescription,
    OrigamiFieldError,
    OrigamiToggleGroupSingle,
    OrigamiToggleGroupItem,
    OrigamiToolbar,
    OrigamiToolbarToggle,
    FormatToggle,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach toggle behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <section>
      <h2>Standalone</h2>
      <button
        ogToggle
        data-testid="standalone"
        aria-label="Bold"
        aria-describedby="standalone-hint"
        [(checked)]="bold"
        (touch)="standaloneTouches.update(increment)"
      >
        B
      </button>
      <p id="standalone-hint">Makes the selection bold.</p>
      <output data-testid="standalone-value">{{ bold() }}</output>
      <output data-testid="standalone-touches">{{ standaloneTouches() }}</output>
    </section>

    <section>
      <h2>Field associations</h2>
      <div ogField data-testid="mute-field">
        <label ogFieldLabel data-testid="mute-label">Mute notifications</label>
        <button
          ogToggle
          data-testid="mute"
          aria-describedby="mute-static"
          [id]="muteId()"
          [(checked)]="muted"
        >
          M
        </button>
        <p ogFieldDescription id="mute-description">You can unmute at any time.</p>
      </div>
      <output data-testid="mute-value">{{ muted() }}</output>
      <button type="button" data-testid="rename-mute" (click)="muteId.set('renamed-mute')">
        Rename the control
      </button>

      <div ogField>
        <button ogToggle id="pin" data-testid="pin">P</button>
        <label ogFieldLabel data-testid="pin-label">Pin the conversation</label>
      </div>
    </section>

    <section>
      <h2>Signal Forms</h2>
      <div ogField #boldField="ogField" data-testid="bold-field">
        <label ogFieldLabel>Bold headings</label>
        <button ogToggle data-testid="bold" [formField]="format.bold">B</button>
        <p ogFieldDescription id="bold-description">Headings need emphasis.</p>
        @if (boldField.state.errorsShown()) {
          <p ogFieldError id="bold-error">{{ boldField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output data-testid="bold-value">{{ model().bold }}</output>
      <output data-testid="bold-touched">{{ format.bold().touched() }}</output>
      <output data-testid="bold-errors-shown">{{ boldField.state.errorsShown() }}</output>
      <button type="button" data-testid="write-bold" (click)="writeBold()">
        Write the bold model
      </button>
      <button type="button" data-testid="focus-bold" (click)="format.bold().focusBoundControl()">
        Focus the bold control
      </button>
      <button type="button" data-testid="reset-bold" (click)="format.bold().reset()">
        Reset the bold field
      </button>

      <div ogField data-testid="italic-field">
        <label ogFieldLabel>Italic quotes</label>
        <button ogToggle data-testid="italic" [formField]="format.italic">I</button>
      </div>
      <output data-testid="italic-value">{{ model().italic }}</output>
      <button type="button" data-testid="freeze-italic" (click)="frozen.update(flip)">
        Freeze italic
      </button>
      <button type="button" data-testid="lock-italic" (click)="locked.update(flip)">
        Lock italic
      </button>
      <button type="button" data-testid="submit-format" (click)="submitFormat()">Submit</button>
      <output data-testid="submits">{{ submits() }}</output>
    </section>

    <section>
      <h2>Composed through hostDirectives</h2>
      <div ogField #composedField="ogField" data-testid="composed-field">
        <label ogFieldLabel>Underline links</label>
        <button formatToggle data-testid="composed" [formField]="format.underline"></button>
        @if (composedField.state.errorsShown()) {
          <p ogFieldError id="composed-error">Underline the links.</p>
        }
      </div>
      <output data-testid="composed-value">{{ model().underline }}</output>
      <output data-testid="composed-touched">{{ format.underline().touched() }}</output>
      <button type="button" data-testid="write-composed" (click)="writeUnderline()">
        Write the composed model
      </button>
      <button type="button" data-testid="freeze-composed" (click)="composedFrozen.update(flip)">
        Freeze the composed field
      </button>
      <button type="button" data-testid="lock-composed" (click)="composedLocked.update(flip)">
        Lock the composed field
      </button>
    </section>

    <section>
      <h2>Toggles composed by other widgets, inside a Field</h2>
      <div ogField data-testid="group-field">
        <label ogFieldLabel data-testid="group-label">Alignment</label>
        <div ogToggleGroupSingle aria-label="Alignment" [(value)]="alignment">
          <button
            ogToggleGroupItem
            value="left"
            id="align-left"
            data-testid="align-left"
            aria-describedby="alignment-note"
          >
            Left
          </button>
          <button ogToggleGroupItem value="center" data-testid="align-center">Center</button>
          <button ogToggleGroupItem value="right" data-testid="align-right" [id]="rightId()">
            Right
          </button>
        </div>
        <p ogFieldDescription id="group-description">Applies to the paragraph.</p>
      </div>
      <output data-testid="alignment-value">{{ alignment() }}</output>
      <button type="button" data-testid="rename-right" (click)="rightId.set('align-right-2')">
        Rename the right item
      </button>

      <div ogField data-testid="toolbar-field">
        <label ogFieldLabel data-testid="toolbar-label">Spelling</label>
        <div ogToolbar aria-label="Formatting">
          <button
            ogToolbarToggle
            data-testid="toolbar-toggle"
            aria-describedby="alignment-note"
            [id]="spellingId()"
            [(checked)]="spelling"
          >
            Spelling
          </button>
          <button ogToolbarToggle data-testid="toolbar-toggle-generated">Grammar</button>
        </div>
        <p ogFieldDescription id="toolbar-description">Checks as you type.</p>
      </div>
      <output data-testid="spelling-value">{{ spelling() }}</output>
      <button type="button" data-testid="rename-spelling" (click)="spellingId.set('spelling-2')">
        Rename the Toolbar Toggle
      </button>
      <p id="alignment-note">Formatting note.</p>
    </section>
  `,
})
export class ToggleFixture {
  readonly attached = signal(false);
  readonly bold = signal(false);
  readonly standaloneTouches = signal(0);
  readonly muted = signal(false);
  readonly muteId = signal("mute");
  readonly frozen = signal(false);
  readonly locked = signal(false);
  readonly composedFrozen = signal(false);
  readonly composedLocked = signal(false);
  readonly submits = signal(0);
  readonly alignment = signal<string | null>(null);
  readonly rightId = signal("align-right");
  readonly spelling = signal(false);
  readonly spellingId = signal("spelling");
  readonly model = signal({ bold: false, italic: true, underline: false });
  readonly format = form(this.model, (path) => {
    required(path.bold, { message: "Turn bold headings on to continue." });
    readonly(path.italic, () => this.frozen());
    disabled(path.italic, () => this.locked());
    required(path.underline);
    readonly(path.underline, () => this.composedFrozen());
    disabled(path.underline, () => this.composedLocked());
  });

  flip(value: boolean): boolean {
    return !value;
  }

  increment(value: number): number {
    return value + 1;
  }

  writeBold(): void {
    this.model.update((model) => ({ ...model, bold: !model.bold }));
  }

  writeUnderline(): void {
    this.model.update((model) => ({ ...model, underline: !model.underline }));
  }

  async submitFormat(): Promise<void> {
    await submit(this.format, async () => {
      this.submits.update((count) => count + 1);
    });
  }
}
