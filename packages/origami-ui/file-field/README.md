# File field

A file field takes one file: from the browser's own file picker, through a native `<input type="file">` you hide visually and name with a `<label>`, or dropped on an optional drop zone around it. Its value is a `File` or `null`. Origami owns the selection, the drag-over state and the ARIA; you own the markup, the visible file name, previews, uploading and error messages. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, and it joins a [Field](../field/README.md) on its own.

[src/file-field/attach-document.ts](../snippets/src/file-field/attach-document.ts "playground")

| Directive             | Configuration                                                                         |
| --------------------- | ------------------------------------------------------------------------------------- |
| `ogFileField`         | `value: File \| null` model (default `null`), `disabled` (default `false`)            |
| `ogFileFieldInput`    | none; a native `<input>`, made `type="file"`                                          |
| `ogFileFieldDropZone` | none; any element inside the root or the root itself, usually the `<label>` around it |

```html
<div ogFileField [(value)]="invoice">
  <label ogFileFieldDropZone class="zone">
    <span class="button-look">Choose a file</span> or drag it here
    <input ogFileFieldInput class="sr-only" accept=".pdf,.jpg,.png" />
  </label>
</div>
@if (invoice(); as file) {
<p>{{ file.name }}</p>
}
```

One Input per root. The zone is optional: without it the field takes files from the picker only. Make the zone the `<label>` around the Input, as above, so a click anywhere on it opens the picker; a zone that isn't a label opens nothing on click unless a label inside it does.

## Hide the input, keep it focusable

The Input is the one control: it takes focus, opens the picker on Enter and Space, and is what assistive technology reads, a button named by its label. Hide it visually, never with `display: none` or `hidden`, which take it out of the keyboard and the accessibility tree:

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* show the hidden input's focus on what users see */
.zone:has(:focus-visible) {
  outline: 2px solid var(--focus);
}
```

A label click opens the picker natively, before and after hydration, with no script. Render the chosen file's name yourself, from `state.value()` or your model: the Input's own status text differs by browser and language, and it's hidden. Don't add `multiple`: the field keeps one file.

## Forms and Fields

<!-- prettier-ignore -->
```html
<div ogField #field="ogField">
  <div ogFileField [formField]="billing.invoice" #picker="ogFileField">
    <label ogFieldLabel ogFileFieldDropZone class="zone">
      <span class="button-look">Επιλέξτε αρχείο</span> ή σύρετέ το εδώ
      <input ogFileFieldInput class="sr-only" accept=".pdf,.jpg,.jpeg,.png" />
    </label>
  </div>
  <p ogFieldDescription>PDF, JPG ή PNG (max. 25MB)</p>
  @if (picker.state.value(); as file) { <p>{{ file.name }}</p> }
  @if (field.state.errorsShown()) {
    @switch (field.state.errors()[0]?.kind) {
      @case ("required") { <p ogFieldError>Υποχρεωτικό</p> }
      @case ("fileTooLarge") { <p ogFieldError>Έως 25MB</p> }
      @case ("fileType") { <p ogFieldError>Μόνο PDF, JPG ή PNG</p> }
    }
  }
</div>
```

```ts
const MB = 1024 * 1024;

function tooLarge(file: File | null, limit: number) {
  if (file !== null && file.size > limit) {
    return { kind: "fileTooLarge" };
  }

  return undefined;
}

function notOfType(file: File | null, extensions: readonly string[]) {
  if (file === null || extensions.some((extension) => file.name.toLowerCase().endsWith(extension))) {
    return undefined;
  }

  return { kind: "fileType" };
}

readonly #model = signal({ invoice: null as File | null });
readonly billing = form(this.#model, (path) => {
  required(path.invoice);
  validate(path.invoice, ({ value }) => tooLarge(value(), 25 * MB));
  validate(path.invoice, ({ value }) => notOfType(value(), [".pdf", ".jpg", ".jpeg", ".png"]));
  disabled(path.invoice, () => this.uploading()); // no second pick or drop while uploading
});
```

- **Signal Forms:** put `[formField]` on the root, for a `File | null` field. It binds the `value` model, writes `disabled` from the field's `disabled()` rules and marks the field touched when focus leaves the Input, and also after each pick and drop: a file choice is complete when it's made, so a drop-only user sees a size error at once. `required()` fails for `null`. `focusBoundControl()` focuses the Input.
- **Validation is yours.** Size, type and name rules are Signal Forms `validate()` rules over the `File`, as above; Origami ships no rules and no messages. `accept` is only a hint to the picker: browsers don't enforce it on drops, on the picker's "All files" choice or on writes, so validate the type in the form and again on the server. Checking `type` or the extension trusts the file's name, not its contents.
- **Field:** inside an `ogField`, the Input is the Field's control; don't add `ogFieldControl`. A `<label ogFieldLabel>` names it with `for`, whether it's the zone around the Input or a separate label, and its `aria-describedby` names the Descriptions, then the Errors. It carries `aria-invalid` while the Field shows its errors and `aria-required` while the field is required.
- **Standalone:** use `[(value)]` and name the Input with a `<label>` around it, or with `aria-label`.
- **Disabled:** the Input is natively disabled, so its picker doesn't open, and the zone refuses drops: no highlight, and the browser delivers no drop. Your own writes to the model, the Options or the form still apply. There's no `readonly`: a form's `readonly()` rule doesn't reach the field, so use `disabled()` or don't render it.

### Clearing and choosing again

Write `null` through your model, `field().value.set(null)` or `reset({ invoice: null, … })`. **A bare `reset()` only resets touched and dirty and keeps the file**, because Signal Forms resets the value only when you pass one. Writing `null` also empties the native input, so the user can choose the same file again. Cancelling the picker keeps the previous choice. Choosing the same file again without clearing writes nothing in Chromium and WebKit, and a new `File` in Firefox.

**With `[formField]`, don't reject a pick by writing the form field back to null inside the pick's own `valueChange`.** Angular Signal Forms 22.2.6 doesn't push that write to the root: the form holds `null` while the root's `value` and the native input keep the file. Signal Forms takes the root's write into the form without recording it as the value it last pushed, so `null` looks unchanged. Write the root's own `value` instead, which reaches the form too, or write the form after the next render:

```html
<div
  ogFileField
  #picker="ogFileField"
  [formField]="billing.invoice"
  (valueChange)="reject(picker, $event)"
>
  …
</div>
```

```ts
reject(picker: OrigamiFileField, file: File | null): void {
  if (file !== null && !accepted(file)) {
    picker.value.set(null);
  }
}
```

### Your own control

A component that composes `ogFileField` through `hostDirectives` exposes `value`, `valueChange`, `disabled` and `touch`, so `[formField]` on it finds them, and forwards `focus()`, which Signal Forms calls on the component it binds:

```ts
@Component({
  selector: "app-attachment",
  hostDirectives: [
    {
      directive: OrigamiFileField,
      inputs: ["value", "disabled"],
      outputs: ["valueChange", "touch"],
    },
  ],
  imports: [OrigamiFileFieldInput, OrigamiFileFieldDropZone],
  template: `<label ogFileFieldDropZone>Attach <input ogFileFieldInput class="sr-only" /></label>`,
})
export class Attachment {
  readonly #root = inject(OrigamiFileField);

  focus(options?: FocusOptions): void {
    this.#root.focus(options);
  }
}
```

## Drops

While a drag that carries files is over the zone, it has an empty `data-drag-over`; style it with `[data-drag-over]`. It stays while the pointer crosses the zone's children and goes when the drag leaves or drops. Text and link drags don't highlight it and aren't accepted. A drop writes the first file and ignores the rest; the zone keeps the browser from opening the file. Origami never stops the drag events' propagation, so your own listeners still see them.

Zones can nest, also those of two fields: the innermost zone under the pointer owns the drag. While the drag is over an inner zone, the zone around it isn't highlighted, and a drop there goes only to the inner zone's field, under that field's disabled state; back over the outer zone's own area, the outer zone is highlighted again.

A drop outside every zone gets the browser's default: Chromium opens the file in a new tab and keeps the page; other browsers may open it in the page itself, losing unsaved form state. So does a drop before the zone has hydrated, unless a zone around it has: that zone then takes the drop into its own field, and no guard prevents that, so hydrate an inner zone no later than the zone around it. To keep the browser from opening the files that miss every zone, add one guard to your app shell. It must leave native file inputs alone, which take dropped files themselves:

```ts
host: { "(document:dragover)": "guard($event)", "(document:drop)": "guard($event)" },

guard(event: DragEvent): void {
  const target = event.target;

  // a native file input accepts dropped files: keep its default
  if (target instanceof HTMLInputElement && target.type === "file") {
    return;
  }

  if (event.dataTransfer?.types.includes("Files")) {
    event.preventDefault();
  }
}
```

In Firefox, a drag from an element on the page that carries files and is cancelled with Escape can leave `data-drag-over` on until the next drop on that zone or its remount: Firefox sends the zone no `dragleave`. What Escape leaves after a drag of files from the operating system is unmeasured in every browser. Shadow-DOM zones and slotted Inputs are untested.

The acceptance drops real files from disk only in Chromium. In Firefox and WebKit it drives the zone with drags made by the page, so it relies on those browsers marking a drag of files from the operating system with `"Files"`, as the HTML standard requires; if one didn't, its drags wouldn't highlight or drop on the zone, and the browser's default would apply.

## Replacing Options

`OrigamiFileFieldOptions` has `value` and `disabled`. A replacement may hold plain signals: the Input follows writes to them, also from a timer or a request, with nothing in a template reading the value. A replacement owns the value, so `[formField]` doesn't bind it: a directive that replaces the Options and takes `[formField]` declares its own `value` model and forwards `focus()`. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

```ts
providers: [
  OrigamiFileFieldOptions.provideFactory(() => ({
    value: signal<File | null>(null),
    disabled: signal(false),
  })),
],
```

## State and attributes

`OrigamiFileFieldState` has `value()` and `disabled()`, the effective values from the Options. The root exposes it as `state`, and its descendants can inject it.

| Element | Attributes                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | none of its own                                                                                                                                                                    |
| Input   | `type="file"`, `id` (yours, or a generated one), native `disabled`; in a Field, `aria-describedby`, `aria-invalid="true"` while errors show, `aria-required="true"` while required |
| Zone    | `data-drag-over` while a file drag is over it and the field is enabled                                                                                                             |

## Accessibility

The picker, the keyboard and the accessible name all stay native: one control, a button named by its label and described by the Field's Descriptions and Errors. The zone has no role or keyboard handling of its own: the Input is the keyboard and single-pointer alternative to dragging. Screen readers announce the chosen file differently, or not at all, so render its name as text. The acceptance checks the accessibility tree, not a screen reader.

## Server rendering and hydration

The server renders the Input with its `id`, `disabled` and Field ARIA, and the Label's `for`, never a file; hydration keeps them. A file picked through the server-rendered Input before its block hydrates is kept: it's written once the block has hydrated, as a pick, so the field is touched and its errors show; Angular's replay of the pick doesn't write it again. A file chosen while hydration finishes, with the picker still open, is an ordinary pick. Leaving the Input before hydration touches the field once it hydrates. A drop before the zone hydrates isn't caught, as above: keep a zone out of a `@defer (hydrate on interaction)` block, which a drag never triggers, prefer `hydrate on immediate` or `on viewport`, or add the guard. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No multiple files, uploading, progress, previews, existing server files or remove actions; no size, type or count validation of its own, and no `accept` enforcement; no `readonly`; no `name`, native form submission or `<form>` reset; no page-wide drop guard; no clean-up of a drag cancelled with Escape; no picker button or `showPicker()`; no `capture`, folders or paste. These are yours or out of scope.
