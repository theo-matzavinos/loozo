import {
  Component,
  DOCUMENT,
  Directive,
  ElementRef,
  PLATFORM_ID,
  PendingTasks,
  TemplateRef,
  ViewContainerRef,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  model,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import type { AfterViewInit, Signal, WritableSignal } from "@angular/core";
import { isPlatformBrowser } from "@angular/common";
import { FormField, disabled, form, required, submit, validate } from "@angular/forms/signals";
import type { FieldState, FormValueControl } from "@angular/forms/signals";
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
  OrigamiFileFieldOptions,
  OrigamiFileFieldState,
} from "@loozo/origami-ui/file-field";

// File field cases (FF). Controls the tests use as script actions are buttons. No document
// `dragover` or `drop` listener anywhere on this route: the zones' own cancellation is the only
// one (FF4, FF5, FF12), and a drop outside every zone gets the browser's default.

const MB = 1024 * 1024;
const INVOICE_TYPES = [".pdf", ".jpg", ".jpeg", ".png"];

/** `{ kind: "fileTooLarge" }` for a file over `limit` bytes. */
function tooLarge(file: File | null, limit: number): { kind: string } | undefined {
  if (file !== null && file.size > limit) {
    return { kind: "fileTooLarge" };
  }

  return undefined;
}

/** `{ kind: "fileType" }` for a file whose name has none of `extensions`. */
function notOfType(file: File | null, extensions: readonly string[]): { kind: string } | undefined {
  if (file === null) {
    return undefined;
  }

  const name = file.name.toLowerCase();

  if (extensions.some((extension) => name.endsWith(extension))) {
    return undefined;
  }

  return { kind: "fileType" };
}

function errorKinds(state: FieldState<File | null>): string {
  const kinds: string[] = [];

  for (const error of state.errors()) {
    kinds.push(error.kind);
  }

  return kinds.join(",");
}

function nameOf(file: File | null): string {
  return file?.name ?? "null";
}

/** Counts `set` calls on a plain signal the fixture owns. */
function countSets<T>(value: WritableSignal<T>, sets: WritableSignal<number>): void {
  const set = value.set.bind(value);

  value.set = (next: T) => {
    sets.update((count) => count + 1);
    set(next);
  };
}

/**
 * While `armed`, undoes each write of a File to a plain signal the fixture owns at once, inside
 * that write, as a consumer rejecting it would, and counts the Files it undid (FF10).
 */
function clearFiles(
  value: WritableSignal<File | null>,
  armed: Signal<boolean>,
  cleared: WritableSignal<number>,
): void {
  const set = value.set.bind(value);

  value.set = (next: File | null) => {
    set(next);

    if (next !== null && untracked(armed)) {
      cleared.update((count) => count + 1);
      set(null);
    }
  };
}

/**
 * In the browser, with `?hold-stability` in the URL, a pending task that keeps the application
 * unstable until the returned function runs: eager hydration replays the events that reached the
 * server's elements only once the application is stable (FF7). Null otherwise.
 */
function holdStability(): (() => void) | null {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    return null;
  }

  const query = new URLSearchParams(inject(DOCUMENT).location.search);

  if (!query.has("hold-stability")) {
    return null;
  }

  return inject(PendingTasks).add();
}

/**
 * A consumer component composing the root through `hostDirectives` and exposing its `value`,
 * `disabled`, `valueChange` and `touch`, so `[formField]` on it finds them; it forwards `focus()`,
 * which Signal Forms calls on the component it binds.
 */
@Component({
  selector: "acceptance-file-composer",
  hostDirectives: [
    {
      directive: OrigamiFileField,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  imports: [OrigamiFileFieldDropZone, OrigamiFileFieldInput],
  template: `
    <label ogFileFieldDropZone class="zone" data-testid="composed-zone">
      Attach a document
      <input ogFileFieldInput class="sr-only" data-testid="composed-input" />
    </label>
  `,
})
export class FileComposer {
  readonly #root = inject(OrigamiFileField);
  readonly state = this.#root.state;

  focus(options?: FocusOptions): void {
    this.#root.focus(options);
  }
}

/**
 * Existing replacement Options: a consumer directive that is itself the `FormValueControl`, with
 * its own `value` model and `disabled` input supplying the root's Options. It exposes the root's
 * `touch` and forwards `focus()`, which Signal Forms calls on the control it binds.
 */
@Directive({
  selector: "[ownedFile]",
  exportAs: "ownedFile",
  hostDirectives: [{ directive: OrigamiFileField, outputs: ["touch"] }],
  providers: [OrigamiFileFieldOptions.provideExisting(() => OwnedFile)],
})
export class OwnedFile implements OrigamiFileFieldOptions, FormValueControl<File | null> {
  /** The composed root, whose own `value` model Signal Forms must not bind. */
  readonly field = inject(OrigamiFileField);
  readonly value = model<File | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly state = inject(OrigamiFileFieldState);

  focus(options?: FocusOptions): void {
    this.field.focus(options);
  }
}

/**
 * Factory replacement Options with plain signals the fixture owns: no template reads the value
 * (FF10), so only the Input's tracked mirror can follow a write from a timer.
 */
@Directive({
  selector: "[plainFile]",
  exportAs: "plainFile",
  hostDirectives: [OrigamiFileField],
  providers: [
    OrigamiFileFieldOptions.provideFactory(() => {
      const fixture = inject(FileFieldFixture);

      return { value: fixture.plainValue, disabled: fixture.plainDisabled };
    }),
  ],
})
export class PlainFile {}

/** Factory Options whose value is a plain `signal()` the fixture owns, which outlives the root. */
@Directive({
  selector: "[droppedFile]",
  hostDirectives: [{ directive: OrigamiFileField, outputs: ["touch"] }],
  providers: [
    OrigamiFileFieldOptions.provideFactory(() => ({
      value: inject(FileFieldFixture).droppedValue,
      disabled: computed(() => false),
    })),
  ],
})
export class DroppedFile {}

/**
 * Focuses its element and takes focus away again during the change detection that creates it,
 * before any render callback: a lifecycle hook, since a render callback would run after the file
 * field root's first render.
 */
@Directive({ selector: "[focusThenLeave]" })
export class FocusThenLeave implements AfterViewInit {
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  ngAfterViewInit(): void {
    this.#element.focus();
    this.#element.blur();
  }
}

/**
 * Gives its Input a native `stale.pdf`, as a pick would, then does as `focusThenLeave` and
 * replaces the Input and resets the field, in the same change detection and before the root's
 * first render, so before the Input's first-render adoption (FF9's same-render part-only
 * teardown).
 */
@Directive({ selector: "input[focusLeaveReplace]" })
export class FocusLeaveReplace implements AfterViewInit {
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #fixture = inject(FileFieldFixture);

  ngAfterViewInit(): void {
    const transfer = new DataTransfer();

    transfer.items.add(new File(["s"], "stale.pdf", { type: "application/pdf" }));
    this.#element.files = transfer.files;
    this.#element.focus();
    this.#element.blur();
    this.#fixture.replace();
  }
}

/**
 * The host's `data-client-rendered` is absent in server HTML and set once the browser renders the
 * fixture: FF7 reads it to know its action reached a block that was still dehydrated.
 * `release-stability` ends the hold `?hold-stability` takes (see `holdStability`). In the
 * browser, `window.fileFieldFixture` is the fixture, for the File identity checks.
 */
@Component({
  selector: "acceptance-file-field-fixture",
  host: { "[attr.data-client-rendered]": "clientRendered" },
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
    FileComposer,
    OwnedFile,
    PlainFile,
    DroppedFile,
    FocusThenLeave,
    FocusLeaveReplace,
  ],
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
    .zone {
      display: block;
      position: relative;
      box-sizing: border-box;
      width: 420px;
      padding: 16px;
      border: 2px dashed #94a3b8;
      border-radius: 8px;
      cursor: pointer;
    }
    .zone[data-drag-over] {
      border-color: #5eead4;
      background: #123b38;
    }
    .zone:has(:focus-visible) {
      outline: 2px solid #5eead4;
      outline-offset: 2px;
    }
    .zone.inner {
      width: auto;
      margin-top: 12px;
    }
    .row {
      display: block;
      margin: 12px 0 0;
      padding: 12px;
      background: #27364a;
    }
    .row span {
      display: inline-block;
      padding: 8px;
      background: #455b76;
    }
    .button-look {
      display: inline-block;
      padding: 4px 10px;
      border: 1px solid currentColor;
      border-radius: 4px;
    }
    .outside {
      display: block;
      width: 420px;
      height: 80px;
      margin: 16px 0;
      background: #252a31;
    }
  `,
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach file field behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="before-fields">Before the fields</button>
    <button type="button" data-testid="release-stability" (click)="releaseStability()">
      Let the application become stable
    </button>

    <section>
      <h2>Billing, in a Field</h2>
      <!-- The controls come first: the Error appearing on blur must not move them mid-click. -->
      <output data-testid="billing-value">{{ name(billing.invoice().value()) }}</output>
      <output data-testid="billing-root-value">{{ name(billingPicker.state.value()) }}</output>
      <output data-testid="billing-errors">{{ kinds(billing.invoice()) }}</output>
      <output data-testid="billing-touched">{{ billing.invoice().touched() }}</output>
      <output data-testid="billing-writes">{{ billingWrites() }}</output>
      <output data-testid="billing-touches">{{ billingTouches() }}</output>
      <button type="button" data-testid="billing-submit" (click)="submitBilling()">Submit</button>
      <button type="button" data-testid="billing-reset" (click)="billing().reset()">Reset</button>
      <button
        type="button"
        data-testid="billing-reset-null"
        (click)="billing().reset({ invoice: null, comments: '' })"
      >
        Reset to null
      </button>
      <button type="button" data-testid="billing-model-null" (click)="writeInvoice(null)">
        Write null
      </button>
      <button
        type="button"
        data-testid="billing-write"
        (click)="writeInvoice(createdFile('written.pdf', 3))"
      >
        Write a file
      </button>
      <button
        type="button"
        data-testid="billing-focus"
        (click)="billing.invoice().focusBoundControl()"
      >
        Focus the bound control
      </button>
      <button
        type="button"
        data-testid="billing-lock"
        (click)="billingLocked.set(!billingLocked())"
      >
        Toggle disabled
      </button>
      <button type="button" data-testid="billing-before">Before billing</button>

      <div ogField #billingField="ogField">
        <div
          ogFileField
          #billingPicker="ogFileField"
          [formField]="billing.invoice"
          (valueChange)="billingWrites.set(billingWrites() + 1)"
          (touch)="billingTouches.set(billingTouches() + 1)"
          data-testid="billing-root"
        >
          <label
            ogFieldLabel
            ogFileFieldDropZone
            class="zone"
            id="billing-label"
            data-testid="billing-zone"
          >
            <span class="button-look">Επιλέξτε αρχείο</span> ή σύρετέ το εδώ
            <span class="row" data-testid="billing-p">
              <span data-testid="billing-span">Τιμολόγιο</span>
            </span>
            <input
              ogFileFieldInput
              class="sr-only"
              accept=".pdf,.jpg,.jpeg,.png"
              data-testid="billing-input"
            />
          </label>
          @if (billing.invoice().value()) {
            <button ogFileFieldClear aria-label="Αφαίρεση τιμολογίου" data-testid="billing-clear">
              ×
            </button>
          }
        </div>
        <p ogFieldDescription id="billing-description">PDF, JPG ή PNG (max. 25MB)</p>
        @if (billingField.state.errorsShown()) {
          <p ogFieldError id="billing-error" data-testid="billing-error">
            {{ billingField.state.errors()[0]?.kind }}
          </p>
        }
      </div>
      <div class="outside" data-testid="outside">Outside every zone</div>

      <h2>Image slot, no zone</h2>
      <output data-testid="image-value">{{ name(media.file().value()) }}</output>
      <output data-testid="image-writes">{{ imageWrites() }}</output>
      <output data-testid="image-touches">{{ imageTouches() }}</output>
      <div ogField>
        <label ogFieldLabel id="image-label">Εικόνα Προώθησης</label>
        <div
          ogFileField
          [formField]="media.file"
          (valueChange)="imageWrites.set(imageWrites() + 1)"
          (touch)="imageTouches.set(imageTouches() + 1)"
          data-testid="image-root"
        >
          <label class="choose" data-testid="image-choose">
            Επιλέξτε αρχείο
            <input
              ogFileFieldInput
              class="sr-only"
              accept="image/png,image/jpeg"
              data-testid="image-input"
            />
          </label>
          <!-- Always rendered: an empty field's Clear, in server HTML too (FF2, FF7, FF15). -->
          <button ogFileFieldClear data-testid="image-clear">Αφαίρεση εικόνας</button>
        </div>
        <p ogFieldDescription id="image-description">1280x1280px, JPG ή PNG, έως 1MB.</p>
      </div>

      <h2>Rejected in valueChange</h2>
      <!-- Each File the user picks is rejected from valueChange through the root's own value,
           the workaround for a same-turn form write (FF3). -->
      <output data-testid="rejected-value">{{ name(rejectedForm.file().value()) }}</output>
      <output data-testid="rejected-root-value">{{ name(rejectedPicker.value()) }}</output>
      <output data-testid="rejected-count">{{ rejected() }}</output>
      <div
        ogFileField
        #rejectedPicker="ogFileField"
        [formField]="rejectedForm.file"
        (valueChange)="reject(rejectedPicker, $event)"
        data-testid="rejected-root"
      >
        <label class="choose" data-testid="rejected-choose">
          Rejected attachment
          <input ogFileFieldInput class="sr-only" data-testid="rejected-input" />
        </label>
      </div>

      <h2>Disabled</h2>
      <output data-testid="disabled-value">{{ name(disabledFile()) }}</output>
      <output data-testid="disabled-writes">{{ disabledWrites() }}</output>
      <button
        type="button"
        data-testid="disabled-write"
        (click)="disabledFile.set(createdFile('model.pdf', 3))"
      >
        Write a file
      </button>
      <div
        ogFileField
        [(value)]="disabledFile"
        disabled
        (valueChange)="disabledWrites.set(disabledWrites() + 1)"
        data-testid="disabled-root"
      >
        <label ogFileFieldDropZone class="zone" data-testid="disabled-zone">
          Disabled attachment
          <input ogFileFieldInput class="sr-only" data-testid="disabled-input" />
        </label>
        <button ogFileFieldClear data-testid="disabled-clear">
          Remove the disabled attachment
        </button>
      </div>

      <h2>Nested roots</h2>
      <output data-testid="nested-outer-value">{{ name(nestedOuter()) }}</output>
      <output data-testid="nested-outer-writes">{{ nestedOuterWrites() }}</output>
      <output data-testid="nested-outer-touches">{{ nestedOuterTouches() }}</output>
      <output data-testid="nested-inner-value">{{ name(nestedInner()) }}</output>
      <output data-testid="nested-inner-writes">{{ nestedInnerWrites() }}</output>
      <output data-testid="nested-inner-touches">{{ nestedInnerTouches() }}</output>
      <button
        type="button"
        data-testid="nested-outer-lock"
        (click)="nestedOuterLocked.set(!nestedOuterLocked())"
      >
        Toggle the outer field's disabled
      </button>
      <button
        type="button"
        data-testid="nested-inner-lock"
        (click)="nestedInnerLocked.set(!nestedInnerLocked())"
      >
        Toggle the inner field's disabled
      </button>
      <div
        ogFileField
        ogFileFieldDropZone
        class="zone"
        [(value)]="nestedOuter"
        [disabled]="nestedOuterLocked()"
        (valueChange)="nestedOuterWrites.set(nestedOuterWrites() + 1)"
        (touch)="nestedOuterTouches.set(nestedOuterTouches() + 1)"
        data-testid="nested-outer-zone"
      >
        <span class="row" data-testid="nested-outer-area">Outer attachment</span>
        <input
          ogFileFieldInput
          class="sr-only"
          aria-label="Outer attachment"
          data-testid="nested-outer-input"
        />
        <div
          ogFileField
          [(value)]="nestedInner"
          [disabled]="nestedInnerLocked()"
          (valueChange)="nestedInnerWrites.set(nestedInnerWrites() + 1)"
          (touch)="nestedInnerTouches.set(nestedInnerTouches() + 1)"
        >
          <label ogFileFieldDropZone class="zone inner" data-testid="nested-inner-zone">
            Inner attachment
            <span class="row" data-testid="nested-inner-span">Συνημμένο</span>
            <input ogFileFieldInput class="sr-only" data-testid="nested-inner-input" />
          </label>
        </div>
      </div>

      <h2>Composer through hostDirectives</h2>
      <output data-testid="composed-value">{{ name(composedForm.file().value()) }}</output>
      <output data-testid="composed-touched">{{ composedForm.file().touched() }}</output>
      <output data-testid="composed-errors">{{ kinds(composedForm.file()) }}</output>
      <button
        type="button"
        data-testid="composed-focus"
        (click)="composedForm.file().focusBoundControl()"
      >
        Focus the composed control
      </button>
      <acceptance-file-composer
        [formField]="composedForm.file"
        #composer
        data-testid="composed-root"
      />
      <output data-testid="composed-state">{{ name(composer.state.value()) }}</output>

      <h2>Existing Options</h2>
      <output data-testid="owned-value">{{ name(ownedForm.file().value()) }}</output>
      <output data-testid="owned-own-value">{{ name(owned.field.value()) }}</output>
      <output data-testid="owned-state">{{ name(owned.state.value()) }}</output>
      <output data-testid="owned-touched">{{ ownedForm.file().touched() }}</output>
      <button
        type="button"
        data-testid="owned-focus"
        (click)="ownedForm.file().focusBoundControl()"
      >
        Focus the owned control
      </button>
      <button type="button" data-testid="owned-lock" (click)="ownedLocked.set(!ownedLocked())">
        Toggle disabled
      </button>
      <div ownedFile #owned="ownedFile" [formField]="ownedForm.file" data-testid="owned-root">
        <label ogFileFieldDropZone class="zone" data-testid="owned-zone">
          Owned attachment
          <input ogFileFieldInput class="sr-only" data-testid="owned-input" />
        </label>
        <button ogFileFieldClear data-testid="owned-clear">Remove the owned attachment</button>
      </div>

      <h2>Plain signals, no template read</h2>
      <button type="button" data-testid="plain-write-file" (click)="writePlainLater(true)">
        Write a file from a timer
      </button>
      <button type="button" data-testid="plain-write-null" (click)="writePlainLater(false)">
        Write null from a timer
      </button>
      <button
        type="button"
        data-testid="plain-clear-picks"
        (click)="plainClearing.set(!plainClearing())"
      >
        Toggle clearing each File written
      </button>
      <output data-testid="plain-cleared">{{ plainCleared() }}</output>
      <div plainFile data-testid="plain-root">
        <label class="choose" data-testid="plain-choose">
          Plain attachment
          <input ogFileFieldInput class="sr-only" data-testid="plain-input" />
        </label>
      </div>
      <button type="button" data-testid="after-fields">After the fields</button>

      <h2>Left before the first render</h2>
      <output data-testid="early-touches">{{ earlyTouches() }}</output>
      <button type="button" data-testid="early-show" (click)="earlyShown.set(true)">
        Render a field whose Input loses focus at once
      </button>
      @if (earlyShown()) {
        <div ogFileField (touch)="earlyTouches.set(earlyTouches() + 1)">
          <input ogFileFieldInput aria-label="Early" data-testid="early-input" focusThenLeave />
        </div>
      }

      <h2>Removed by its touch before its first render</h2>
      <output data-testid="dropped-value">{{ name(droppedValue()) }}</output>
      <output data-testid="dropped-sets">{{ droppedSets() }}</output>
      <output data-testid="dropped-touches">{{ droppedTouches() }}</output>
      <button type="button" data-testid="dropped-show" (click)="showDropped()">
        Render a field whose Input loses focus at once; its touch removes it
      </button>
      <ng-container #droppedHost />
      <ng-template #dropped>
        <div droppedFile (touch)="dropDropped()">
          <input ogFileFieldInput aria-label="Dropped" data-testid="dropped-input" focusThenLeave />
        </div>
      </ng-template>

      <h2>Input replaced before the first render</h2>
      <output data-testid="replaced-value">{{ name(replacedForm.file().value()) }}</output>
      <output data-testid="replaced-writes">{{ replacedWrites() }}</output>
      <output data-testid="replaced-touches">{{ replacedTouches() }}</output>
      <output data-testid="replaced-touched">{{ replacedForm.file().touched() }}</output>
      <button type="button" data-testid="replaced-show" (click)="replacedShown.set(true)">
        Render a field whose first Input loses focus and is replaced at once
      </button>
      @if (replacedShown()) {
        <div ogField #replacedField="ogField">
          <div
            ogFileField
            [formField]="replacedForm.file"
            (valueChange)="replacedWrites.set(replacedWrites() + 1)"
            (touch)="replacedTouches.set(replacedTouches() + 1)"
          >
            @if (replacedFirst()) {
              <input
                ogFileFieldInput
                aria-label="First"
                data-testid="replaced-a"
                focusLeaveReplace
              />
            } @else {
              <input ogFileFieldInput aria-label="Replacement" data-testid="replaced-b" />
            }
          </div>
          @if (replacedField.state.errorsShown()) {
            <p ogFieldError data-testid="replaced-error">
              {{ replacedField.state.errors()[0]?.kind }}
            </p>
          }
        </div>
        <button type="button" data-testid="replaced-after">After the replaced field</button>
      }
    </section>
  `,
})
export class FileFieldFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);

  readonly billingLocked = signal(false);
  readonly billingModel = signal({ invoice: null as File | null, comments: "" });
  readonly billing = form(this.billingModel, (path) => {
    required(path.invoice);
    validate(path.invoice, ({ value }) => tooLarge(value(), 25 * MB));
    validate(path.invoice, ({ value }) => notOfType(value(), INVOICE_TYPES));
    disabled(path.invoice, () => this.billingLocked());
  });
  readonly billingWrites = signal(0);
  readonly billingTouches = signal(0);

  readonly media = form(signal({ file: null as File | null }));
  readonly imageWrites = signal(0);
  readonly imageTouches = signal(0);

  readonly rejectedForm = form(signal({ file: null as File | null }));
  readonly rejected = signal(0);

  readonly disabledFile = signal<File | null>(null);
  readonly disabledWrites = signal(0);

  /** Two roots, each with its own zone, the inner one inside the outer one's (FF12). */
  readonly nestedOuter = signal<File | null>(null);
  readonly nestedOuterLocked = signal(false);
  readonly nestedOuterWrites = signal(0);
  readonly nestedOuterTouches = signal(0);
  readonly nestedInner = signal<File | null>(null);
  readonly nestedInnerLocked = signal(false);
  readonly nestedInnerWrites = signal(0);
  readonly nestedInnerTouches = signal(0);

  readonly composedForm = form(signal({ file: null as File | null }), (path) => {
    required(path.file);
  });

  readonly ownedLocked = signal(false);
  readonly ownedForm = form(signal({ file: null as File | null }), (path) => {
    required(path.file);
    disabled(path.file, () => this.ownedLocked());
  });

  /** The plain factory's value and policy: no template reads `plainValue`. */
  readonly plainValue = signal<File | null>(null);
  readonly plainDisabled = signal(false);
  /** While set, each File written to `plainValue` is undone inside its write (FF10). */
  readonly plainClearing = signal(false);
  readonly plainCleared = signal(0);
  /** The File the last timer wrote, for FF10's identity check. */
  plainFile: File | null = null;

  readonly earlyShown = signal(false);
  readonly earlyTouches = signal(0);

  /** The dropped field's value, owned here so it outlives the root, and its `set` count. */
  readonly droppedValue = signal<File | null>(null);
  readonly droppedSets = signal(0);
  readonly droppedTouches = signal(0);

  readonly replacedShown = signal(false);
  readonly replacedFirst = signal(true);
  readonly replacedForm = form(signal({ file: null as File | null }), (path) => {
    required(path.file);
  });
  readonly replacedWrites = signal(0);
  readonly replacedTouches = signal(0);

  readonly kinds = errorKinds;
  readonly name = nameOf;

  readonly #stabilityHold = holdStability();

  private readonly droppedHost = viewChild.required("droppedHost", { read: ViewContainerRef });
  private readonly dropped = viewChild.required<TemplateRef<unknown>>("dropped");

  constructor() {
    countSets(this.droppedValue, this.droppedSets);
    clearFiles(this.plainValue, this.plainClearing, this.plainCleared);
    afterNextRender(() => {
      (window as unknown as { fileFieldFixture: FileFieldFixture }).fileFieldFixture = this;
    });
  }

  releaseStability(): void {
    this.#stabilityHold?.();
  }

  /** A page-made File: `size` bytes of `x`. */
  createdFile(name: string, size: number): File {
    return new File(["x".repeat(size)], name, { type: "application/pdf", lastModified: 1234 });
  }

  writeInvoice(file: File | null): void {
    this.billingModel.set({ ...this.billingModel(), invoice: file });
  }

  async submitBilling(): Promise<void> {
    // `submit()` marks every field touched; the action itself does nothing here.
    await submit(this.billing, async () => {});
  }

  /**
   * Rejects each File the user picks, inside its `valueChange`, by writing null to the root's own
   * `value`: Signal Forms takes it through the model's listener. Writing the form field back to
   * null here instead isn't pushed to the root (README "Clearing and choosing again").
   */
  reject(picker: OrigamiFileField, file: File | null): void {
    if (file !== null) {
      this.rejected.update((count) => count + 1);
      picker.value.set(null);
    }
  }

  writePlainLater(file: boolean): void {
    setTimeout(() => {
      if (file) {
        this.plainFile = this.createdFile("timer.pdf", 5);
        this.plainValue.set(this.plainFile);
      } else {
        this.plainValue.set(null);
      }
    });
  }

  showDropped(): void {
    this.droppedHost().createEmbeddedView(this.dropped());
  }

  /** The root's `touch`: destroys the root at once, while its first render's drain is running. */
  dropDropped(): void {
    this.droppedTouches.set(this.droppedTouches() + 1);
    this.droppedHost().clear();
  }

  /** Replaces the replaced field's first Input and resets the field, before its first render. */
  replace(): void {
    this.replacedFirst.set(false);
    this.replacedForm().reset({ file: null });
  }
}
