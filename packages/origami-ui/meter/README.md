# Meter

A meter shows a measurement within a known range, such as the share of today's arrivals that have been validated, a disk's usage or the seats taken of a capacity. It isn't the progress of a task, which is [Progress](../progress/README.md). It's one directive on your own element, a `role="meter"`: Origami owns the value, its range, the value text and the ARIA, and you own the name, the markup, the drawing and every style.

[src/meter/arrivals-gauge.ts](../snippets/src/meter/arrivals-gauge.ts "playground")

| Directive | Configuration                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `ogMeter` | `value: number` (required), `min` (default `0`), `max` (default `100`), `valueText: string \| null` (default `null`); exposes `state` |

```html
<h2 id="arrivals-title">Arrivals</h2>
@if (arrivals(); as arrivals) {
<div
  ogMeter
  #gauge="ogMeter"
  class="ring"
  [value]="arrivals.percentage"
  aria-labelledby="arrivals-title"
>
  <span aria-hidden="true">{{ gauge.state.valueText() }}</span>
</div>
} @else {
<p>No arrivals data for this period</p>
}

<!-- a range that isn't a percentage -->
<div ogMeter [value]="occupied()" [max]="capacity()" aria-label="Seats taken"></div>
```

## Naming

ARIA requires a meter to have a name, and Origami binds none, so nothing it does can overwrite yours. Point `aria-labelledby` at a visible heading, such as the dashboard cell's title outside the meter, or write an `aria-label`, statically, by binding or from your own component's `host`. In a repeated template, give each heading a unique ID, with [`injectUniqueId`](../utils/README.md) or your own domain ID.

## Values

`value` is required, and a meter has no unknown state: while there's no data, render your own "no data" UI instead of a meter. `[value]="arrival()?.percentage"` doesn't compile, because `undefined` isn't a number, and `?? 0` would show missing data as a real 0%, so put the meter in an `@if`.

The value renders clamped to `[min, max]`, and the bounds follow native `<meter>`: a value that isn't a finite number renders as `min`, a `min` or `max` that isn't finite renders as its default, and a `max` below `min` is raised to it. Nothing is validated, thrown or logged, and the value is never written back.

| `value`                  | `min`              | `max`              | `aria-valuemin` | `aria-valuemax` | `aria-valuenow` | percent | text   |
| ------------------------ | ------------------ | ------------------ | --------------- | --------------- | --------------- | ------- | ------ |
| `75`                     | unset              | unset              | `0`             | `100`           | `75`            | 75      | `75%`  |
| `130`                    | unset              | unset              | `0`             | `100`           | `100`           | 100     | `100%` |
| `-5`                     | unset              | unset              | `0`             | `100`           | `0`             | 0       | `0%`   |
| `NaN`, ±∞, `""`, `"abc"` | unset              | unset              | `0`             | `100`           | `0`             | 0       | `0%`   |
| `15`                     | `10`               | `20`               | `10`            | `20`            | `15`            | 50      | `50%`  |
| `5`, `NaN`               | `10`               | `20`               | `10`            | `20`            | `10`            | 0       | `0%`   |
| `25`                     | `10`               | `20`               | `10`            | `20`            | `20`            | 100     | `100%` |
| `5`                      | `NaN`, ±∞          | `20`               | `0`             | `20`            | `5`             | 25      | `25%`  |
| `5`                      | `0`                | `NaN`, ±∞          | `0`             | `100`           | `5`             | 5       | `5%`   |
| `15`                     | `20`               | `10`               | `20`            | `20`            | `20`            | 0       | `0%`   |
| `10`                     | `10`               | `10`               | `10`            | `10`            | `10`            | 0       | `0%`   |
| `50`                     | `150`              | `NaN`              | `150`           | `150`           | `150`           | 0       | `0%`   |
| `"15"` (attribute)       | `"10"` (attribute) | `"20"` (attribute) | `10`            | `20`            | `15`            | 50      | `50%`  |

A range you compute can be empty, such as a capacity of 0: the meter then sits at `0%`, which reads as a real measurement, so show your own "nothing to measure" state instead. `null` or `undefined` from untyped code (`$any`, a JSON field typed `number`) renders as `min`.

## Value text and locale

`aria-valuetext` is what assistive technology reads. By default it's the value's position in the range as a percent, formatted by `Intl.NumberFormat` under the root's `LOCALE_ID`: `75%` for 75 of 0–100 in `en-US` and `el-GR`, `50%` for 15 of 10–20, `50 %` in `fr-FR`. A component that provides its own `LOCALE_ID` changes it for its subtree.

Set `valueText` to say something else, in your own translation; a string, the empty string included, is bound as given:

```html
<div
  ogMeter
  [value]="occupied()"
  [max]="capacity()"
  [valueText]="occupied() + ' of ' + capacity() + ' seats'"
  aria-label="Seats taken"
></div>
```

Use the input, not a static `aria-valuetext`: the binding replaces the attribute.

## Styling

Origami binds no styles. The root has a custom property, `--og-meter-percent`, the value's position from `0%` to `100%`, always present, so the server HTML already draws the right amount. A ring is a conic gradient, and a bar a child sized with a logical property, so the same CSS works in right-to-left text:

```css
.ring {
  display: grid;
  place-items: center;
  inline-size: 10rem;
  aspect-ratio: 1;
  border-radius: 50%;
  background: conic-gradient(var(--fill) var(--og-meter-percent), var(--track) 0);
}
.ring::before {
  content: "";
  grid-area: 1 / 1;
  inline-size: 75%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--surface);
}
.ring > span {
  grid-area: 1 / 1;
}

.bar > .fill {
  display: block;
  block-size: 100%;
  inline-size: var(--og-meter-percent);
}
```

To animate the ring between values, register the property with `@property --og-meter-percent { syntax: "<percentage>"; inherits: true; initial-value: 0%; }`, transition it, and remove the transition under `prefers-reduced-motion: reduce`. There are no `data-*` markers; bind a class from State to style a value, such as `[class.full]="gauge.state.percent() === 100"`.

Show the value as text from State, inside the root or beside it, and hide it from assistive technology, which already reads the meter's value text. Hide every drawing inside the root too: ARIA makes a meter's children presentational, but browsers still expose an image or a chart in it as a child of the meter.

## Charts

To draw the meter with a chart library, wrap the chart in an `aria-hidden` element inside the root, and feed it State rather than your raw number: `percent` for its series and `valueText` for its label. The arc and its label then agree with what the meter reports, also when the raw value is out of range or isn't a number (a raw 130 draws a full arc labelled `100%`, not `130%`).

```html
<div ogMeter #gauge="ogMeter" [value]="arrival.percentage" aria-labelledby="arrivals-title">
  <app-arrivals-chart
    aria-hidden="true"
    [percent]="gauge.state.percent()"
    [text]="gauge.state.valueText()"
  />
</div>
```

A chart library that touches `window` when it's imported fails a server render if you import it statically. Import it only in the browser, with a dynamic `import()` in `afterNextRender`; the server HTML still carries the meter's complete semantics, and the drawing appears once the browser renders it.

## Your own component

Compose the directive through `hostDirectives` to keep your own tag, and name the meter from your `host`. `value` is required, so expose it: Angular rejects a required host-directive input that isn't exposed.

```ts
@Component({
  selector: "app-gauge",
  hostDirectives: [{ directive: OrigamiMeter, inputs: ["value", "min", "max", "valueText"] }],
  host: { class: "ring", "[attr.aria-labelledby]": "labelledBy()" },
  template: `<span aria-hidden="true">{{ meter.state.valueText() }}</span>`,
})
export class Gauge {
  readonly labelledBy = input.required<string>();
  protected readonly meter = inject(OrigamiMeter);
}
```

## Replacing Options

`OrigamiMeterOptions` is the root's configuration: `value`, `min`, `max` and `valueText` signals. Replace it as a whole with `provideFactory` or `provideExisting`; the directive's own inputs are then ignored, though a composer still exposes and binds `value`. The signals are first read by whichever comes first, a State read or the root's first render, also on the server, so they must hold their values by then:

```ts
providers: [
  OrigamiMeterOptions.provideFactory(() => {
    const venue = inject(Venue);

    return {
      value: venue.occupied,
      min: signal(0),
      max: venue.capacity,
      valueText: computed(() => `${venue.occupied()} of ${venue.capacity()}`),
    };
  }),
];
```

## Reading State

`OrigamiMeterState`, which descendants inject and the root exposes as `state`, reports what's rendered: `value` (clamped), `percent` (0 to 100, unrounded) and `valueText`. Nested roots each have their own.

Inject it anywhere, but evaluate its signals late. Every one of them reads the root's required `value`, and Angular sets a bound `value` only when change detection reaches the root's bindings; reading it before then throws NG0950. A read in a constructor or field initializer fails the route's server render; a template read before the root lets the server answer, but its meter, like the browser's after it, has none of its value attributes.

```ts
// Safe: a binding inside or after the root, a composer's template, a lazy computed, ngOnInit.
@Directive({ selector: "[gaugeLabel]", host: { "[attr.title]": "text()" } })
export class GaugeLabel {
  readonly #state = inject(OrigamiMeterState);
  readonly text = computed(() => this.#state.valueText());
}

// Throws NG0950: evaluated in a field initializer, before Angular has set the bound value.
@Directive({ selector: "[gaugeLabelTooEarly]" })
export class GaugeLabelTooEarly {
  readonly text = inject(OrigamiMeterState).valueText();
}
```

```html
<!-- Throws NG0950: this binding runs before the root's own. Move it after the root. -->
<p>{{ gauge.state.valueText() }}</p>
<div ogMeter #gauge="ogMeter" [value]="percentage()" aria-label="Arrivals"></div>
```

A static `value="75"` is set earlier, so the same reads don't throw there, but they will as soon as you bind the value.

## Attributes

| Attribute            | Value                                   |
| -------------------- | --------------------------------------- |
| `role`               | `meter`, static                         |
| `aria-valuemin`      | the effective min                       |
| `aria-valuemax`      | the effective max                       |
| `aria-valuenow`      | the clamped value                       |
| `aria-valuetext`     | `valueText`, else the localized percent |
| `--og-meter-percent` | the value's position, `0%` to `100%`    |

All of them are always present. Within one render Angular writes them one at a time; once the render is done, `aria-valuemin ≤ aria-valuenow ≤ aria-valuemax`.

## Server rendering and hydration

The server renders every attribute and the custom property: the meter is complete in the first HTML, with no generated IDs and no second pass. Eager and incremental hydration keep the nodes and the attributes, and a consumer with no data renders no meter on either side. Provide the same `LOCALE_ID` on the server and in the browser; the default value text is then the same on both when their `Intl` formats the percent the same way, and otherwise the browser rewrites it at its first change detection, without a hydration error. A meter in a `@defer` block that hasn't hydrated yet keeps the server's value until it does. An invalid `LOCALE_ID` makes `Intl` throw a `RangeError` the first time the default text is formatted.

## Not included

No label, value, track or indicator part; no `low`, `high` or `optimum` regions; no unknown state; no `data-*` markers; no `locale` input or formatter callback; no drawing or chart dependency; no live-region announcements of value changes and no warning for a missing name or invalid bounds; no vertical orientation or animated value. A meter isn't a form control, so it doesn't join a Field.
