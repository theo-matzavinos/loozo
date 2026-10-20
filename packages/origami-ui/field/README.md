# Field

Field wires a form control to its label, hints and error messages, and shows its [Signal Forms](https://angular.dev/guide/forms/signals/overview) state. Signal Forms owns the value and the validation; Field adds the `for`, `id` and `aria-describedby` links between the parts, and tells you when to show errors.

[src/field/signup-email.ts](../snippets/src/field/signup-email.ts "both")

| Part                 | Configuration            | Put it on                                      |
| -------------------- | ------------------------ | ---------------------------------------------- |
| `ogField`            | none                     | any element around the parts                   |
| `ogFieldLabel`       | `id` (default generated) | a `<label>`                                    |
| `ogFieldControl`     | `id` (default generated) | a native `<input>`, `<select>` or `<textarea>` |
| `ogFieldDescription` | `id` (default generated) | any element with a hint                        |
| `ogFieldError`       | `id` (default generated) | any element with a message, under `@if`        |

Parts join the nearest `ogField`, so a Field inside another one is independent. A Field has one control; a second one is reported through Angular's `ErrorHandler` and ignored. Labels, Descriptions and Errors can be anywhere inside the Field, before or after the control, and in their own components.

## Wiring

- **Label:** `for` names the control's `id`, so clicking the label focuses the input, or checks a checkbox, and the control takes its accessible name from it. Several Labels may name one control.
- **Descriptions and Errors:** the control's `aria-describedby` names every `ogFieldDescription`, then every mounted `ogFieldError`, each in the order they appeared. An Error mounted later comes after the ones already shown.
- Inside a Field, Origami owns the control's `aria-describedby` and the Label's `for`: static values are replaced. Add hints with `ogFieldDescription` instead.
- Outside a Field, the parts bind only their `id`, and keep your static attributes.

`ogFieldControl` doesn't change how `[formField]` treats the element: Angular still reads and writes its value, marks it touched on blur and sets native `disabled`, `required` and `readonly`. Field adds no `ControlValueAccessor`.

## Form state

The root exposes `OrigamiFieldState` as `state`, which descendants can also inject. It reads the `[formField]` on the Field's control:

| Signal        | Value                                                                              |
| ------------- | ---------------------------------------------------------------------------------- |
| `invalid`     | the field has validation errors                                                    |
| `touched`     | the field was blurred, or marked touched by `submit()` or `markAsTouched()`        |
| `disabled`    | a `disabled()` rule applies, its own or an ancestor's                              |
| `required`    | a `required()` validator applies                                                   |
| `errors`      | the field's own errors (`FieldState.errors()`), as Signal Forms' `ValidationError` |
| `errorsShown` | `invalid()` and `touched()`: the moment to show the errors                         |

Without a control, or without `[formField]` on it, every signal is `false` and `errors` is empty. Disabled and readonly fields aren't validated, so they show no errors. Render each `ogFieldError` under `@if (field.state.errorsShown())`; the message text is yours, often from `errors()[0]?.message`.

## Attributes

| Element            | Attributes                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Field              | `data-invalid` while errors are shown, `data-disabled` while disabled, `data-required` while required; no `role` |
| Label              | `id`, `for` (while a control is registered)                                                                      |
| Control            | `id`, `aria-describedby` (while it has Descriptions or Errors), `aria-invalid="true"` while errors are shown     |
| Description, Error | `id`                                                                                                             |

## Accessibility

- Use a `<label>` for `ogFieldLabel`, so the control gets its name from it.
- For a set of Fields, such as an address, use your own `<fieldset>` and `<legend>`; Field has no role.
- Field shows errors once the user has left the field or tried to submit, never while they type the first time.

## Replacing Options

Each part has its own Options with just `id`, for example to take IDs from your own records: `OrigamiFieldLabelOptions`, `OrigamiFieldControlOptions`, `OrigamiFieldDescriptionOptions` and `OrigamiFieldErrorOptions`. The root has none. See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## Server rendering and hydration

Every `id`, the Label's `for` and the control's `aria-describedby` and `aria-invalid` are in the server HTML, including an Error the form shows from the start, and hydration keeps them. What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No fieldset or legend part, required marker, message text or `aria-errormessage`, and no form value, validation or submission of its own: those are Signal Forms'. Hide fields with `@if` yourself when Signal Forms' `hidden()` applies.
