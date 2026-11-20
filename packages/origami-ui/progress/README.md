# Progress

Progress shows how much of a task is done, such as the steps of a dialog or an upload, or that its progress is unknown while it loads. It's one directive on your own element, a `role="progressbar"`: Origami owns the value, its range, the value text and the ARIA, and you own the name, the markup, every style and the animation.

[src/progress/dialog-steps.ts](../snippets/src/progress/dialog-steps.ts "playground")

| Directive    | Configuration                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogProgress` | `value: number \| null` (default `null`, which means unknown progress), `max` (default `100`), `valueText: string \| null` (default `null`) |

```html
<h3 id="schedule-title">Change schedule</h3>
<div ogProgress [value]="step()" [max]="steps()" aria-labelledby="schedule-title" class="bar">
  <span class="fill"></span>
</div>

<!-- no value: unknown progress, an indeterminate bar -->
<div ogProgress aria-label="Loading reservations" class="loader">
  <span class="loader-bar"></span>
</div>
```

## Naming

ARIA requires a progress bar to have a name, and Origami binds none, so nothing it does can overwrite yours. Point `aria-labelledby` at a visible title, or write an `aria-label`, statically, by binding or from your own component's `host`. A title outside the bar, such as a dialog's heading, works as it is. In a repeated template, give each title a unique ID, with [`injectUniqueId`](../utils/README.md) or your own domain ID.

The bar's children are presentational to assistive technology, so don't put a heading or a link inside it.

## Values

The minimum is always 0. A value renders clamped to `[0, max]`; one that isn't a finite number, and a `max` that isn't finite or is 0 or less, make the bar indeterminate. Nothing is validated, thrown or logged, and the value is never written back.

| `value`                                 | `max`               | `aria-valuenow` | `aria-valuemax` | percent | state         |
| --------------------------------------- | ------------------- | --------------- | --------------- | ------- | ------------- |
| unset, `null`, `NaN`, ±∞, `""`, `"abc"` | 100                 | absent          | `100`           | null    | indeterminate |
| `2`                                     | `4`                 | `2`             | `4`             | 50      | progressing   |
| `-1`                                    | `4`                 | `0`             | `4`             | 0       | progressing   |
| `4`, `5`                                | `4`                 | `4`             | `4`             | 100     | complete      |
| `0`                                     | `0`, `-3`, `NaN`, ∞ | absent          | absent          | null    | indeterminate |
| `"2"` (attribute)                       | `"4"` (attribute)   | `2`             | `4`             | 50      | progressing   |

A step one past the end (`value="4" max="3"`) shows a full bar, not a loading animation. A total you compute from a count can be 0, such as zero files to upload: the bar is then indeterminate, so show your own "nothing to do" state instead.

## Value text

`aria-valuetext` is what assistive technology reads. By default it's the rendered value's percent, formatted by `Intl.NumberFormat` under the root's `LOCALE_ID`: `67%` for 2 of 3 in `en-US` and `el-GR`, `67 %` in `fr-FR`. A component that provides its own `LOCALE_ID` changes it for its subtree. An indeterminate bar has none by default.

Set `valueText` to say something else, in your own translation; a string, the empty string included, is bound as given, also while the bar is indeterminate:

```html
<div
  ogProgress
  [value]="sent()"
  [max]="total()"
  [valueText]="sentLabel() + ' of ' + totalLabel()"
  aria-labelledby="upload-name"
>
  …
</div>
<div ogProgress valueText="Loading…" aria-label="Reservations"></div>
```

Use the input, not a static `aria-valuetext`: the binding replaces the attribute.

## Styling

Origami binds no styles. The root has a custom property, `--og-progress-percent`, the value's position from `0%` to `100%`, which your fill reads with a logical property, so the same CSS works in right-to-left text. Empty `data-complete` and `data-indeterminate` markers style the end and the unknown state; a progressing bar has neither. While indeterminate the custom property is absent, so give the animated fill its own size, and a reduced-motion variant:

```css
.bar {
  position: relative;
  block-size: 4px;
  overflow: hidden;
}
.fill {
  display: block;
  block-size: 100%;
  inline-size: var(--og-progress-percent);
}
.bar[data-complete] .fill {
  background: var(--success);
}
.bar[data-indeterminate] .fill {
  inline-size: 40%;
  animation: slide 1.2s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .bar[data-indeterminate] .fill {
    inline-size: 100%;
    animation: none;
    opacity: 0.5;
  }
}
```

## Visible text

Origami renders no text. Read the State through a template reference, and hide your text from assistive technology, which already reads the bar's value text:

```html
<div ogProgress #bar="ogProgress" [value]="step()" [max]="steps()" aria-labelledby="title">…</div>
<p aria-hidden="true">{{ bar.state.valueText() }}</p>
```

## Your own component

Compose the directive through `hostDirectives` to keep your own tag and input names, and name the bar from your `host`:

```ts
@Component({
  selector: "app-step-bar",
  hostDirectives: [{ directive: OrigamiProgress, inputs: ["value", "max", "valueText: label"] }],
  host: { "[attr.aria-labelledby]": "titleId()" },
  template: `<span class="fill"></span>`,
})
export class StepBar {
  readonly titleId = input.required<string>();
}
```

## Replacing Options

`OrigamiProgressOptions` is the root's configuration: `value`, `max` and `valueText` signals. Replace it as a whole with `provideFactory` or `provideExisting`; the directive's own inputs are then ignored. The root reads it in its first render, also on the server, so the signals must hold their values by then:

```ts
providers: [
  OrigamiProgressOptions.provideFactory(() => {
    const upload = inject(Upload);

    return { value: upload.sentBytes, max: upload.totalBytes, valueText: upload.label };
  }),
];
```

## State and attributes

`OrigamiProgressState`, which descendants inject and the root exposes as `state`, reports what's rendered: `value` (clamped, null while indeterminate), `percent` (0 to 100, null while indeterminate), `complete` and `valueText` (null while indeterminate without one). Nested roots each have their own.

| Attribute               | Value                                                            |
| ----------------------- | ---------------------------------------------------------------- |
| `role`                  | `progressbar`, static                                            |
| `aria-valuemin`         | `0`, static                                                      |
| `aria-valuemax`         | the effective max; absent without a valid one                    |
| `aria-valuenow`         | the clamped value; absent while indeterminate                    |
| `aria-valuetext`        | `valueText`, else the localized percent; absent while null       |
| `--og-progress-percent` | the value's position, `0%` to `100%`; absent while indeterminate |
| `data-complete`         | empty while the value equals max                                 |
| `data-indeterminate`    | empty while there's no value                                     |

Within one render Angular writes these attributes one at a time, so a `MutationObserver` can see `aria-valuenow` above a shrinking `aria-valuemax` between two records; once the render is done they're in bounds.

## Server rendering and hydration

The server renders every attribute and the custom property: the bar is complete in the first HTML, with no generated IDs and no second pass. Eager and incremental hydration keep the nodes and the attributes. Provide the same `LOCALE_ID` on the server and in the browser; the default value text is then the same on both when their `Intl` formats the percent the same way, and otherwise the browser rewrites it at its first change detection, without a hydration error. A bar in a `@defer` block that hasn't hydrated yet keeps the server's value until it does. An invalid `LOCALE_ID` makes `Intl` throw a `RangeError` the first time the default text is formatted.

## Not included

No label, value, track or indicator part; no `min`; no `locale` input or formatter callback; no `aria-busy` or live-region management for the content the bar reports on; no warning for a missing name; no buffer or secondary value, segmented display, vertical orientation or animated value. A progress bar isn't a form control, so it doesn't join a Field. A gauge of a measurement rather than a task, `role="meter"`, is a different primitive.
