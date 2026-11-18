# @loozo/ui-sdk-angular

Angular directives for [ui-sdk.dev](https://ui-sdk.dev)'s headless core, `@ui-sdk/core`. Core keeps every behavior: keyboard, focus, ARIA, popups and selection. This package puts each of a component's parts on an element you write, one attribute directive per part, and renders core's attributes on the server and in the browser, so the page is correct before it hydrates.

**Status:** experimental. MIT license. It has [Toggle](toggle/README.md), single-value [Select](select/README.md), [Checkbox](checkbox/README.md), [Switch](switch/README.md) and [RadioGroup](radio/README.md), which take part in native forms.

## Install

```sh
npm install @loozo/ui-sdk-angular @ui-sdk/core@0.1.0-beta.7
```

- Angular `~22.2.2` (`@angular/core` and `@angular/common`).
- `@ui-sdk/core` exactly `0.1.0-beta.7`, as a peer dependency. Its renderer entry isn't public API and changes often, so each release of this package pins the one core version it was tested with. Another core version is an install-time peer conflict on purpose.

No provider: import the directives where you use them.

```ts
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import {
  UiSelect,
  UiSelectContent,
  UiSelectFormInput,
  UiSelectItem,
  UiSelectTrigger,
  UiSelectValue,
} from "@loozo/ui-sdk-angular/select";
import { UiCheckbox, UiCheckboxIndicator, UiCheckboxInput } from "@loozo/ui-sdk-angular/checkbox";
import { UiSwitch, UiSwitchInput, UiSwitchThumb } from "@loozo/ui-sdk-angular/switch";
import { UiRadio, UiRadioGroup, UiRadioIndicator, UiRadioInput } from "@loozo/ui-sdk-angular/radio";
```

Each component has its own entry, like core's. The primary entry, `@loozo/ui-sdk-angular`, has the `UiSdkEvent` type, the `UiSdkError` class and the input transforms `optionalBoolean`, `optionalChecked` and `optionalNumber`; its `ɵ`-prefixed exports are internal.

## How the directives map to core

- A root directive (`uiToggle`, `uiSelect`, `uiCheckbox`, `uiSwitch`, `uiRadioGroup`) owns one core instance. Its inputs are core's options, under core's names. An unset input (`undefined`) isn't passed to core.
- Each part directive (`uiSelectTrigger`, `uiSelectItem`, …) is one core slot on its host element. Its inputs are the slot's props.
- A controlled key (`pressed`, `checked`, `value`, `open`, `query`) controls the component when its input is set, and leaves core in charge while it's `undefined`. `null` is a value: a Select with `[value]="null"` selects nothing and stays controlled. Don't switch a key between controlled and uncontrolled.
- Each `on<Key>Change` callback is two outputs: `<key>ChangeRequest` first, with `{ value, details }`, where `details.cancel()` refuses the change; then `<key>Change` with the value, unless canceled. `[(value)]` binds the input and the second output.
- Each part with a state in core has a `state` signal, and each directive's `exportAs` is its selector.
- Style a part by the attributes core writes on it, like `[aria-pressed="true"]` or `[data-highlighted]`.
- Your attributes win over core's: a static `id`, `aria-label` or `aria-labelledby` on a part's element is the one rendered.

Each component's readme has its directives, inputs, outputs and rules.

## Native forms

Checkbox, Switch, RadioGroup and Select submit, reset and validate with a `<form>` through a hidden native input that you write, one directive on an `<input>`:

```html
<form>
  <button uiCheckbox #terms="uiCheckbox" name="terms" aria-label="Terms"></button>
  <input [uiCheckboxInput]="terms" />

  <div uiSelect name="fruit">
    …
    <input uiSelectFormInput />
  </div>
</form>
```

- **Where it goes.** A checkbox's or switch's input goes beside its `<button>`, since an `<input>` inside a button isn't valid HTML, and names its control by a template reference: `[uiCheckboxInput]="terms"`, `[uiSwitchInput]="wifi"`, `[uiRadioInput]="radio"`, one input per radio. The reference is read once; pointing it at another control later has no effect. Select's `uiSelectFormInput` goes inside the Select's element.
- **What core writes.** The input becomes visually hidden, `aria-hidden` and out of the tab order, with the control's `type`, `name`, `value`, `form`, `required` and `disabled`. Screen readers and keyboards use the control, not the input.
- **Before hydration** the server-rendered input already submits the server's value, and `required` already blocks submission.
- **Reset and validation.** A form reset returns each control to its default (`defaultChecked`, `defaultValue`; through `<key>ChangeRequest`, so it can be refused). When an invalid submit focuses a hidden input, core moves focus to its control.
- **A `<fieldset disabled>`** disables the buttons inside it natively, from the server HTML on, and leaves their inputs out of the submission. The server can't see the fieldset, so core adds `aria-disabled` and `data-disabled` to the control when it binds: style a disabled control by `:disabled` too, or the style changes at hydration.
- **The `checked` attribute is the default.** As on a native checkbox, the input's `checked` attribute is what a reset returns to; the current state is its `checked` property.
- **`name` without its input.** The control submits nothing; in development, a control with a `name` and no input warns once after its first render.
- **Keep a control and its input in one `@defer (hydrate …)` block.** An input in another block isn't connected until that block hydrates; until then it submits the server's value.
- Angular Forms (`ControlValueAccessor`, signal forms) aren't supported yet: bind `[(checked)]` or `[(value)]` to your own signal.

## Server rendering and hydration

Works with `provideClientHydration()`, eager (`withEventReplay()`, `withNoIncrementalHydration()`) or incremental (Angular 22's default), with or without zone.js.

- **Instance ids.** Every root renders `data-ui-sdk-id` (`ui-sdk-s<n>` from the server) and reads it back while hydrating, so the ids core derives part ids from match on both sides, also under `@defer`. A root the browser creates gets `ui-sdk-<n>`.
- **One `APP_ID` per application.** Two Angular applications on one page need distinct `APP_ID`s, or their ids can collide; with a custom `APP_ID`, ids become `ui-sdk-<appId>-…`.
- **Keep a root and all its parts in one `@defer (hydrate …)` block.** A part in a different hydrate boundary from its root can be unbound while its siblings handle events.
- **`hydrate on interaction` and a fast first press.** In Chromium, a press shorter than the block's hydration can open a Select and close it again: Angular replays the press's `pointerdown` after its `click`. See [Select's known limitation](select/README.md#known-limitation).
- **Authored ids before their references.** A part with a static `id` that other parts point at, like a Select trigger the content's `aria-labelledby` names, must come earlier in the same template than those parts, or sit in an ancestor view. Written after them, the server renders references to the generated id, and core repairs them when the authored part binds.
- **A popup that starts open settles at bind.** A Select rendered open is positioned, and renamed with the same name as `aria-label`, when its trigger binds; see [Select's rules](select/README.md#rules).
- **Events before the first bind.** Angular replays the events a user makes before a block hydrates; they arrive after the parts bind. A live event that reaches a part before its first bind, as in a block created outside change detection, waits and reaches core once every part of that render pass has bound.

Shadow DOM, slotted content and elements from another realm, like an iframe, aren't supported.

## Upgrading core

Each core upgrade is its own release of this package: bump both pins, read core's changelog and the diff of its renderer entry and the kernel files behind it, then run the package's checks. `pnpm test` fails when a core option or slot prop isn't classified or has an input of the wrong kind, or when a part's event types and its directive's listeners drift; the browser suite, in Chromium, Firefox and WebKit with eager and incremental hydration, is the upgrade gate.

## Docs for agents

The package ships its docs as Markdown: `docs/llms.txt` is the index, `docs/<component>.md` each component, and `skills/ui-sdk-angular/SKILL.md` the agent skill. Core's own docs, for options, controllers and behavior, are in `@ui-sdk/core/docs`.

## Development

```sh
pnpm --filter @loozo/ui-sdk-angular run build
pnpm --filter @loozo/ui-sdk-angular test          # type parity, classification and event checks
pnpm --filter @loozo/ui-sdk-angular run test:browser
```

`test:browser` builds the package and the SSR fixture app in `tests/browser/` (eager and incremental), then runs the Playwright suite in all three engines; `UI_SDK_BROWSER=chromium` and `UI_SDK_MODE=eager` narrow it. Its builds and browser runs take the workspace's machine-wide lock (`packages/origami-ui/tests/acceptance/gate-lock.sh`), and WebKit uses Origami's private library setup when `ORIGAMI_WEBKIT_DEPS_ROOT` is set (see [Origami's acceptance readme](../origami-ui/tests/acceptance/README.md)).
