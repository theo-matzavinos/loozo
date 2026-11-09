# Slider

Slider picks one number on a horizontal range by dragging a thumb or with the keyboard, such as a zoom level or a percentage. It's an [Angular Signal Forms](https://angular.dev/guide/forms/signals/overview) control, whose `min()` and `max()` rules become its bounds, and its Thumb joins a [Field](../field/README.md) on its own.

[src/slider/zoom-setting.ts](../snippets/src/slider/zoom-setting.ts "both")

| Directive       | Configuration                                                                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ogSlider`      | `value: number` model (default `0`), `min` (default `undefined`, which means `0`), `max` (default `undefined`, which means `100`), `step` (default `1`), `disabled` (default `false`) |
| `ogSliderTrack` | none; the pointer surface                                                                                                                                                             |
| `ogSliderThumb` | none; the focusable `role="slider"`, inside the Track                                                                                                                                 |

Without a form, bind the value yourself:

```html
<div ogSlider [(value)]="zoom" min="20" max="180" step="10">
  <div ogSliderTrack class="track">
    <div class="range"></div>
    <div ogSliderThumb class="thumb" aria-label="Zoom"></div>
  </div>
</div>
```

## Values

- The allowed values are `min`, `min + step`, `min + 2·step` and so on, up to `max`. `max` itself is allowed only when it lies on that grid: from 20 to 185 by 10, the last allowed value is 180. Results are rounded to the decimal places of `step` and `min`, so 0.1 steps give 0.3, not 0.30000000000000004.
- The value is yours. Only a key or the pointer writes it, and only with an allowed value. The slider never normalizes or writes back a value you set: an off-grid value such as 7.3 stays 7.3 until the user moves it, and the next key lands on the grid (8 or 7). A value outside the range, or `NaN`, stays as it is and only renders clamped: `aria-valuenow` and `--og-slider-percent` use the nearest bound, and `NaN` renders as `min`.
- A user write equal to the current value writes nothing and emits no `valueChange`. While disabled, while the bound field is `readonly()`, and under an invalid configuration, user writes are dropped; your own writes still apply.
- An invalid configuration, a non-finite `min`, `max` or `step`, `min ≥ max` or `step ≤ 0`, isn't validated: the slider renders at 0% and ignores every user write.

## Keyboard

| Key                   | Action                                                                                    |
| --------------------- | ----------------------------------------------------------------------------------------- |
| ArrowRight / ArrowUp  | the next allowed value above the current one; ArrowRight goes down in right-to-left text  |
| ArrowLeft / ArrowDown | the previous allowed value below the current one; ArrowLeft goes up in right-to-left text |
| PageUp / PageDown     | a tenth of the range, rounded to whole steps and at least one step: 0–100 by 1 moves 10   |
| Home / End            | `min` / the last allowed value                                                            |

Keys act from the rendered value: from 150 on a 0–100 slider, ArrowLeft writes 99. Handled keys prevent their default, such as scrolling the page, even when they write nothing: at a bound, while readonly or under an invalid configuration. Keys with Alt, Ctrl, Meta or Shift, keys already `defaultPrevented` and keys during IME composition are ignored; there's no larger Shift step. Direction comes from the Thumb's computed `direction` when the key is pressed; ArrowUp and ArrowDown ignore it.

## Pointer

- A primary press on the Track focuses the Thumb and starts a drag: on the Track it moves the value to the pointer at once, on the Thumb it keeps the distance between the pointer and the value's position, so grabbing the Thumb off-center doesn't make it jump. Other mouse buttons are ignored.
- While the button is held, every move writes the allowed value nearest to the pointer, measured over the Track's border box and clamped at the ends, also when the pointer leaves the Track: the Track captures it. In right-to-left text, from the Track's computed `direction` at the press, positions run from its right edge.
- The drag ends when the button is released, the browser cancels the pointer or the Track loses its capture, at the next pointer event or change detection after the slider becomes disabled or readonly, and when the slider, its Track or its Thumb is removed. A drag that ended never writes again.
- While readonly a press only focuses the Thumb; while disabled it does nothing.
- The press prevents its default, so it neither selects text nor moves focus elsewhere.

Put the Thumb inside the Track: a Thumb outside it can't be grabbed and is keyboard-only. Origami doesn't measure the Thumb.

## Styling

Origami binds no styles. The root has one custom property, `--og-slider-percent`, the clamped value's position from `0%` to `100%`, and empty `data-disabled` and `data-dragging` markers. Position the Thumb and fill a range with logical properties, so the same CSS works in right-to-left text:

```css
.track {
  position: relative;
  block-size: 1.5rem;
  touch-action: pan-y;
}
.range {
  position: absolute;
  inset-inline-start: 0;
  inline-size: var(--og-slider-percent);
}
.thumb {
  position: absolute;
  inline-size: 1rem;
  inset-inline-start: var(--og-slider-percent);
  margin-inline-start: -0.5rem; /* half the Thumb's width, so its center is on the value */
}
[ogSlider][data-dragging] .thumb,
[ogSlider][data-dragging] .range {
  transition: none;
}
```

Center the Thumb with `margin-inline-start: -<half its width>`, which flips with the text direction. `translate: -50%` doesn't: in right-to-left text it shifts the Thumb a whole width away from the value. At the ends half the Thumb overhangs the Track; inset the Track yourself if you don't want that.

`touch-action: pan-y` on the Track lets a horizontal touch drag the slider while a vertical one still scrolls the page; the browser then cancels the slider's pointer, which ends the drag. Without it, the browser takes horizontal touch gestures for panning.

The percentage depends only on the value, so server HTML already carries it and the Thumb renders in place before the page hydrates.

## Forms and Fields

- **Signal Forms:** put `[formField]` on the root. It binds the `value` model, writes `disabled` from the field's `disabled()` rules and `min` and `max` from its `min()` and `max()` rules, so the rules bound keys and the pointer, and marks the field touched when focus leaves the Thumb. While the field is `readonly()`, keys are still handled and a press still focuses the Thumb, but nothing is written. `focusBoundControl()` calls the root's `focus()`, which focuses the Thumb.
- Don't bind `[min]` or `[max]` next to a `min()` or `max()` rule: both write the same input, and whichever writes last wins.
- **Field:** inside an `ogField`, give the slider a Label on any element, such as `<span ogFieldLabel>`. A label can't name the Thumb with `for`, so the Thumb's `aria-labelledby` names every Label of its Field instead, replacing a static one; clicking the Label does nothing. Don't add `ogFieldControl`. The Thumb's `aria-describedby` names the Field's Descriptions and Errors, `aria-invalid` follows the Field's shown errors and `aria-readonly` the field's `readonly()`. ARIA doesn't support `aria-required` on a slider, so the Thumb never has one; a `required()` rule still validates and the Field shows its error.
- **Standalone:** without a Field, use `[(value)]` and name the Thumb yourself with `aria-label` or `aria-labelledby`.
- **`aria-valuetext`** is yours: bind it on the Thumb when the number alone doesn't read well, such as `[attr.aria-valuetext]="zoom.state.value() + '%'"`.

There's no hidden native input, `name` or native form submission.

To wrap the slider in your own component through `hostDirectives`, expose `value`, `valueChange`, `min`, `max`, `disabled` and `touch`, so `[formField]` on your component finds them, and give your component a `focus(options?: FocusOptions)` method that calls the injected `OrigamiSlider`'s `focus(options)`: Signal Forms calls `focus()` on your component, not on the slider.

## Replacing Options

The root's Options carry `value`, `min`, `max`, `step` and `disabled`. Replace them as a whole, for example from a settings store:

```ts
@Directive({
  selector: "[storeSlider]",
  hostDirectives: [OrigamiSlider],
  providers: [
    OrigamiSliderOptions.provideFactory(() => {
      const store = inject(SettingsStore);

      return {
        value: store.zoom,
        min: computed(() => 20),
        max: computed(() => 180),
        step: computed(() => 10),
        disabled: store.locked,
      };
    }),
  ],
})
export class StoreSlider {}
```

A root replacement owns the value, so `[formField]` doesn't bind it. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiSliderState` has `value()`, the effective value as it is, `percent()`, the clamped position from 0 to 100, `disabled()` and `dragging()`. The root exposes it as `state`, and descendants can inject it. The Track and the Thumb have no State.

| Element | Attributes                                                                                                                                                                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root    | `--og-slider-percent` inline, empty `data-disabled` while disabled and `data-dragging` while a drag is live; no role, so add `role="group"` yourself if you want one                                                                                                    |
| Track   | none                                                                                                                                                                                                                                                                    |
| Thumb   | `role="slider"`; `aria-valuenow` (the clamped value), `aria-valuemin`, `aria-valuemax`; `tabindex="0"` while enabled; `aria-disabled="true"` and no `tabindex` while disabled; inside a Field `aria-labelledby`, `aria-describedby`, `aria-invalid` and `aria-readonly` |

There's no `aria-orientation`: horizontal is the slider default.

One Track and one Thumb per slider; a second one fails with an error that Angular reports through the application's `ErrorHandler`.

## Server rendering and hydration

Server HTML carries `--og-slider-percent`, `data-disabled` and the Thumb's role, tab stop, value attributes and, inside a Field, its associations; hydration keeps the elements and those attributes. Nothing reads layout before a pointer event.

Input before the slider hydrates is replayed once when it does. A key moves the value once; its default, such as scrolling, already happened. A press on the Track moves the value to the press point once (a press on the Thumb moves nothing) and focuses the Thumb, but no drag continues: movement before hydration isn't replayed, and holding the button across hydration doesn't drag. Press again to drag.

## Not included

One thumb only: no range or multi-thumb slider. Horizontal only: no vertical orientation. No Shift or large-step option, marks or ticks, value formatter or output part, range or indicator part (use `--og-slider-percent`), commit event, edge alignment that keeps the Thumb inside the Track, `focusableWhenDisabled`, `readonly` input or hidden native input.
