# @loozo/fold-ui

Styled Angular components for back-office apps, built on [Origami](../origami-ui/README.md)'s headless primitives and themed with Tailwind CSS v4. fold doesn't ship a component library you import: its schematics copy each component's source into your app, where you own and edit it.

Each fold part is a directive that adds classes, usually composing an Origami directive; layout-only parts, such as AlertDialog's Header and Footer, compose none. Origami keeps the behavior, accessibility and server rendering; fold adds the look: neutral greys, one green for the primary action, orange only for destructive actions, compact 28, 32 and 36px controls, and dark and light themes.

**Status:** experimental. MIT license. It currently has Button (with ButtonLink), AlertDialog, Dialog, Sheet, and Field with Input, Textarea, Checkbox, Switch, RadioGroup, NumberField and Slider. There's no loading state, Nx support or way to update a theme you already added.

## Requirements

- An Angular 22 application with Tailwind CSS v4 set up, such as one made by `ng new --style=tailwind`, or after `ng add tailwindcss`. Tested with Angular 22.2.6 and Tailwind CSS 4.3.3.
- Tailwind without a `prefix(...)`: fold's classes are unprefixed.

## Set up

```sh
ng add @loozo/fold-ui
```

`ng add` asks for a selector prefix, `fold` by default (`--prefix acme` for `acmeButton`), then:

1. writes `fold.json` at the workspace root: the prefix and the folder components go into, `<sourceRoot>/ui`. If a `fold.json` already exists, it keeps it and uses its values.
2. creates `<sourceRoot>/ui/theme.css` unless it exists, and imports it right after `@import "tailwindcss"` in your global stylesheet.
3. maps `#ui/*` to the components in your `package.json` `imports`, so you import a component as `#ui/button`. It fails if `#ui/*` already maps somewhere else.
4. adds the packages fold's components use to your dependencies, keeping any you already have: `@loozo/origami-ui`, `tailwind-variants`, `@lucide/angular` (for icons) and `@fontsource-variable/hanken-grotesk` (the font).

`ng add` fails if no global `.css` stylesheet of your build imports Tailwind: run `ng add tailwindcss` first.

`fold.json` looks like this:

```json
{
  "$schema": "./node_modules/@loozo/fold-ui/schematics/fold.schema.json",
  "prefix": "fold",
  "path": "src/ui"
}
```

## Add components

```sh
ng generate @loozo/fold-ui:add --names button alert-dialog dialog sheet
ng generate @loozo/fold-ui:add --names field input textarea
ng generate @loozo/fold-ui:add --names checkbox switch radio-group
ng generate @loozo/fold-ui:add --names number-field slider
```

NumberField and Slider import `@loozo/origami-ui/number-field` and `@loozo/origami-ui/slider`, so they need an Origami release that has them; an app set up with an older one needs its `@loozo/origami-ui` raised first, since `add` doesn't change dependencies.

Without `--names`, it asks which components to add. Each component is a folder under the `fold.json` path, with an `index.ts` that re-exports its parts and one file per part:

```text
src/ui/
├── theme.css
├── cn/
│   ├── index.ts
│   └── cn.ts
├── button/
│   ├── index.ts
│   ├── button-style.ts
│   ├── button.ts
│   └── button-link.ts
├── alert-dialog/
│   ├── index.ts
│   ├── alert-dialog.ts
│   ├── alert-dialog-trigger.ts
│   └── …
└── field/
    ├── index.ts
    ├── field.ts
    ├── field-label.ts
    └── …
```

`add` also copies the components a component imports: AlertDialog's, Dialog's and Sheet's buttons are styled by Button's `ButtonStyle`, so adding `alert-dialog`, `dialog` or `sheet` adds `button` too; Textarea shares Input's look, so adding `textarea` adds `input`; and every component merges its classes with `cn`, so the first `add` adds `cn`. Components import each other as `../button`.

The files are yours from then on. `add` writes them with your prefix and the Angular CLI formats them with your workspace's Prettier, so `add` can't tell a file you edited from one you didn't. When a named component's folder already exists, `--existing` decides:

- `skip` (default): keep your folder and warn.
- `overwrite`: write fold's files into the folder, replacing those with the same names. Files you added stay.
- `error`: fail before writing anything.

A component that's only a dependency is always kept when its folder exists. To replace it, name it.

## Theming

`theme.css` holds fifteen color tokens, `--radius`, the soft edge shadow `--edge` and the dialog scrim `--scrim`, then maps them to Tailwind with `@theme inline`. Dark is the default theme, on `:root` and `.dark`; a `.light` class swaps every token, for the whole page or for one subtree:

```html
<html class="light"></html>
```

To re-theme, change the token values in your copy; when you add a text size, radius or shadow, also add its name to `cn` (see [Class merging](#class-merging-and-slots)). Hover, pressed and tint colors are mixed from the tokens with `color-mix()`, and the radius ladder derives from `--radius`, so they follow. The theme also adds:

- utilities such as `bg-primary`, `text-muted-foreground`, `border-input`, `rounded-control`, `rounded-dialog` and `shadow-edge`.
- a five-step type ladder: `text-display` (28px), `text-headline` (20px), `text-title` (15px), `text-body` (13px) and `text-label` (12px), each with its line height and weight. The body text is 13px, set on `<body>`, so `rem` stays 16px and Tailwind's spacing keeps its sizes.
- `dark:` and `light:` variants that follow the classes instead of the system preference. `dark:` doesn't follow an explicit `.dark` nested inside `.light`.
- the Hanken Grotesk variable font, imported from `@fontsource-variable/hanken-grotesk`.

Tailwind's default colors and `text-*` sizes stay available.

## Class merging and slots

Every part except the AlertDialog, Dialog and Sheet roots takes a `class` input that's merged over fold's classes, so a conflicting utility of yours wins:

```html
<button foldButton class="px-6">Wider</button>
```

The merging comes from `cn`, a component like the others. `cn/cn.ts` exports `tv`, `tailwind-variants`' variant builder, and `cn(...classes)`, which joins classes and keeps the last of conflicting utilities. Both are configured with the theme's text sizes, radii and shadows, which Tailwind's defaults don't have: without them, `text-title` would count as a text color and cancel `text-foreground`. Use them for your own components too:

```ts
import { Directive, computed, input } from "@angular/core";
import { cn } from "#ui/cn";

@Directive({
  selector: "[appPanel]",
  host: { "[class]": "classes()" },
})
export class Panel {
  readonly class = input("");

  protected readonly classes = computed(() =>
    cn("rounded-surface bg-surface p-4 shadow-popover", this.class()),
  );
}
```

`cn.ts` lists the `--text-*`, `--radius-*` and `--shadow-*` names of `theme.css`. Keep them in sync: when you add one to the theme, add its name to `cn.ts`, or its utilities won't merge with their peers.

Every part sets a `data-slot` attribute, such as `data-slot="button"` or `data-slot="alert-dialog-content"`, to target it from CSS or from a parent's classes, like `[&_[data-slot=button]]:w-full`. The decorative markup inside Checkbox, Switch, RadioGroupItem and Slider has its own: `checkbox-indicator`, `switch-thumb`, `radio-group-indicator`, and `slider-track`, `slider-rail` and `slider-fill`. NumberField's parts are `number-field`, `number-field-input`, `number-field-decrement`, `number-field-increment` and `number-field-adornment`; Slider's are `slider` and `slider-thumb`.

State is styled from the attributes Origami sets: a disabled button has `data-disabled`, so `data-disabled:` and `not-data-disabled:` variants key on it. A Field has `data-invalid`, `data-disabled` and `data-required` and its control `aria-invalid`, plus `aria-readonly` on a readonly Checkbox, Switch or RadioGroup; Input and Textarea also style native `:disabled` and `[readonly]`. A checked Checkbox, an on Switch and a selected RadioGroupItem have `data-checked`. A NumberField has no state attributes of its own: its box reads its input's `:disabled`, `[readonly]`, `[aria-invalid=true]` and `:focus-visible` through `:has()`, and a − or + button at a limit or while readonly has `data-disabled` without being natively disabled. A Slider has `data-disabled`, `data-dragging` and the `--og-slider-percent` custom property, and its thumb `aria-invalid` and `aria-readonly`. fold's Field adds `data-orientation`.

## Button

```ts
import { Button, ButtonLink } from "#ui/button";
```

`Button` is a native `<button>` over Origami's [Button](../origami-ui/button/README.md): `type="button"`, plus `disabled` and `focusableWhenDisabled`. `ButtonLink` styles an `<a>` the same way and adds no behavior. Both take:

- `variant`: `primary`, `secondary` (default), `destructive`, `ghost` or `link`.
- `size`: `sm` (28px), `md` (32px, default), `lg` (36px) or `icon` (32px square; give it an `aria-label`).

```html
<button foldButton variant="primary" (click)="save()">Save</button>
<button foldButton variant="ghost" size="icon" aria-label="More actions">
  <svg lucideEllipsis></svg>
</button>
<a foldButton variant="link" href="/contracts">All contracts</a>
```

Use `primary` once per view, on the action the view exists for, and `destructive` only for actions that destroy or end something.

`ButtonStyle` is the selectorless directive behind the look; `buttonVariants` returns the classes for a variant and size. Compose `ButtonStyle` through `hostDirectives` to style your own button-like directive, as AlertDialog's Trigger and Cancel do. One fold button part per element: don't put `foldButton` on an `AlertDialogTrigger`.

## AlertDialog

```ts
import { AlertDialogParts } from "#ui/alert-dialog";
import { Button } from "#ui/button";
```

AlertDialog confirms a destructive action, over Origami's [AlertDialog](../origami-ui/dialog/README.md). `AlertDialogParts` holds all nine parts for a component's `imports`; each is also exported on its own.

```html
<div foldAlertDialog [(open)]="open" [dismissible]="!pending()">
  <button foldAlertDialogTrigger variant="destructive">Terminate contract</button>
  <dialog foldAlertDialogContent>
    <div foldAlertDialogHeader>
      <div foldAlertDialogIcon><svg lucideTriangleAlert></svg></div>
      <h2 foldAlertDialogTitle>Terminate contract LC-2041?</h2>
      <p foldAlertDialogDescription>The final invoice is issued today. This can't be undone.</p>
    </div>
    <div foldAlertDialogFooter>
      <button foldAlertDialogCancel [disabled]="pending()" focusableWhenDisabled>Cancel</button>
      <button
        foldButton
        variant="destructive"
        [disabled]="pending()"
        focusableWhenDisabled
        (click)="terminate()"
      >
        Terminate contract
      </button>
    </div>
  </dialog>
</div>
```

- `AlertDialog`: the root, with `open` (two-way), `dismissible` and `openChange`. It's `display: contents` unless it's on the `<dialog>` itself.
- `AlertDialogTrigger`: opens the dialog. It takes Button's `variant`, `size` and `class`, plus `id`, `disabled` and `focusableWhenDisabled`.
- `AlertDialogContent`: the modal `<dialog>`, up to 440px wide, over a scrim, with Dialog's [motion](#motion). It takes `id` and `returnFocus`. The backdrop doesn't close it; Escape does while the dialog is dismissible. When it closes, focus returns to what had it before the dialog opened, or to `returnFocus` if that can take focus; see Origami's [Focus](../origami-ui/dialog/README.md#focus) for when focus was lost.
- `AlertDialogHeader`: lays out the title and description, beside the icon tile when there is one.
- `AlertDialogIcon`: an optional 32px warning tile for an 18px icon, hidden from assistive technology.
- `AlertDialogTitle` and `AlertDialogDescription`: name and describe the dialog for assistive technology. They take `id`.
- `AlertDialogFooter`: the actions, right-aligned.
- `AlertDialogCancel`: closes the dialog and takes initial focus, as the safe choice. Secondary by default; it takes Button's inputs, `disabled` and `focusableWhenDisabled`.

There's no Action part: the action is a `foldButton variant="destructive"` that names the consequence and closes the dialog itself, by setting `open` to `false` when the work succeeds.

While the action is pending, make the dialog non-dismissible and disable both buttons with `focusableWhenDisabled`. A focused button that's natively disabled drops focus to `<body>`, out of the modal; with `focusableWhenDisabled` it stays focused and announces itself as disabled.

A focusable disabled button still dispatches `click`, from a pointer, Enter or Space, so the action's handler returns while pending instead of starting the work again:

```ts
import { finalize } from "rxjs";

// In the component:
protected terminate(): void {
  if (this.pending()) {
    return;
  }

  this.pending.set(true);
  this.contracts
    .terminate(this.contract().id)
    .pipe(finalize(() => this.pending.set(false)))
    .subscribe({
      next: () => this.open.set(false),
      error: () => this.failed.set(true),
    });
}
```

End pending however the work ends: if it fails, the dialog stays open with Cancel, Escape and the action usable again, and can show the error.

## Dialog

```ts
import { DialogParts } from "#ui/dialog";
import { Button } from "#ui/button";
```

Dialog is a centered modal for a task, such as editing a record or filling in search criteria, over Origami's [Dialog](../origami-ui/dialog/README.md). `DialogParts` holds all nine parts for a component's `imports`; each is also exported on its own.

```html
<div foldDialog [(open)]="open" [dismissible]="!pending()">
  <button foldDialogTrigger>Edit contract</button>
  <dialog foldDialogContent>
    <form class="contents" (submit)="save($event)">
      <div foldDialogHeader>
        <h2 foldDialogTitle>Edit contract</h2>
        <p foldDialogDescription>Changes apply from the next billing period.</p>
      </div>
      <div foldDialogBody class="grid gap-4">
        <div foldField>
          <label foldFieldLabel>Reference</label>
          <input foldInput [readOnly]="pending()" [formField]="f.reference" />
        </div>
        …
      </div>
      <div foldDialogFooter>
        <button foldDialogClose [disabled]="pending()" focusableWhenDisabled>Cancel</button>
        <button
          foldButton
          variant="primary"
          type="submit"
          [disabled]="pending()"
          focusableWhenDisabled
        >
          Save
        </button>
      </div>
    </form>
  </dialog>
</div>
```

- `Dialog`: the root, with `open` (two-way), `dismissible` and `openChange`. It's `display: contents` unless it's on the `<dialog>` itself. Escape and a backdrop click close the dialog while it's dismissible.
- `DialogTrigger`: opens the dialog. It takes Button's `variant`, `size` and `class`, plus `id`, `disabled` and `focusableWhenDisabled`.
- `DialogContent`: the modal `<dialog>` over a scrim, centered, 512px wide and at most the viewport's height less 32px; on narrow screens it keeps 16px from each edge. It lays its children out in a column, 20px apart. It takes `id`, `returnFocus`, `closeButton` and `closeLabel`. When it closes, focus returns to what had it before the dialog opened, or to `returnFocus` if that can take focus; see Origami's [Focus](../origami-ui/dialog/README.md#focus) for when focus was lost.
- `DialogHeader`: stacks the title and description, clear of the close button.
- `DialogTitle` and `DialogDescription`: name and describe the dialog for assistive technology. They take `id`.
- `DialogBody`: the part that scrolls when the dialog runs out of height, so the header and footer stay in place. Without a Body, the whole dialog scrolls, close button and footer included.
- `DialogFooter`: the actions, right-aligned.
- `DialogClose`: closes the dialog, whatever `dismissible` says. Secondary by default; it takes Button's inputs, `disabled` and `focusableWhenDisabled`.

Content ends with a close button in its top corner: a ghost icon button named by `closeLabel`, `"Close"` by default, so set it in your app's language. It's disabled but focusable while the dialog isn't dismissible. `[closeButton]="false"` removes it; the Header keeps its room either way. To keep a working close button while the dialog isn't dismissible, remove it and add a `foldDialogClose` of your own.

Content's `class` replaces its width, such as `class="w-[min(640px,calc(100%-32px))]"` for a wider dialog.

### Forms in a dialog

Wrap the header, body and footer in `<form class="contents">`: the form takes no part in the layout, and the footer's submit button submits it.

- **Initial focus.** The dialog opens on an `autofocus` element, else the first focusable one, so a form dialog opens on its first field. Put `autofocus` on another field to start there.
- **While saving**, make the dialog non-dismissible and disable the buttons with `focusableWhenDisabled`, as in an [AlertDialog](#alertdialog); the close button follows `dismissible` on its own. Make the fields `[readOnly]` instead of `[disabled]`: disabling the field that has focus drops focus to `<body>`, out of the modal.
- **Guard the submit handler.** A focusable disabled submit button still submits the form, from Enter on it or Enter in a field, so the handler returns while pending:

```ts
protected save(event: Event): void {
  event.preventDefault();

  if (this.pending()) {
    return;
  }

  this.pending.set(true);
  this.contracts
    .update(this.f().value())
    .pipe(finalize(() => this.pending.set(false)))
    .subscribe({
      next: () => this.open.set(false),
      error: () => this.failed.set(true),
    });
}
```

### Opening a dialog from code

A component can be the Dialog root through `hostDirectives: [Dialog]`, close itself with `inject(OrigamiDialog).open.set(false)` and be opened with Origami's `injectOrigamiDialogOpener`, which [Opening from code](../origami-ui/dialog/README.md#opening-from-code) describes:

```ts
import { Component, inject, input, linkedSignal, output } from "@angular/core";
import { OrigamiDialog } from "@loozo/origami-ui/dialog";
import { Button } from "#ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#ui/dialog";

@Component({
  selector: "app-invoice-search-dialog",
  imports: [Button, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle],
  hostDirectives: [Dialog],
  template: `
    <dialog foldDialogContent class="w-[min(640px,calc(100%-32px))]">
      <form class="contents" (submit)="submit($event)">
        <div foldDialogHeader><h2 foldDialogTitle>Search invoices</h2></div>
        <div foldDialogBody class="grid gap-4 sm:grid-cols-2">…</div>
        <div foldDialogFooter>
          <button foldButton variant="primary" type="submit">Search</button>
        </div>
      </form>
    </dialog>
  `,
})
export class InvoiceSearchDialog {
  readonly initialCriteria = input.required<InvoiceCriteria>();
  readonly search = output<InvoiceCriteria>();

  protected readonly draft = linkedSignal(() => this.initialCriteria());
  readonly #dialog = inject(OrigamiDialog);

  protected submit(event: Event): void {
    event.preventDefault();
    this.search.emit(this.draft());
    this.#dialog.open.set(false);
  }
}
```

```ts
// In the page:
readonly #search = injectOrigamiDialogOpener(InvoiceSearchDialog);

protected openSearch(): void {
  const criteria = this.criteria();

  this.#search.open({
    initialCriteria: () => criteria,
    search: (next) => this.criteria.set(next),
  });
}
```

The component's host is appended to `<body>`, outside your `<main>`, where `<header>` and `<footer>` would become the page's banner and contentinfo landmarks: put the Header and Footer on `<div>`s.

### Motion

DialogContent and AlertDialogContent fade and scale in over 150ms when they open and back out when they close, with the backdrop fading alongside. Reopening during the exit reverses it smoothly. With `prefers-reduced-motion: reduce`, they open and close at once.

- During the exit the dialog stays modal, as Origami's [closing](../origami-ui/dialog/README.md#opening-and-closing) describes, so the page stays inert for those 150ms.
- The transition is in Content's classes. Origami waits only for the dialog's own transition, so if your `class` changes its `duration-*`, change `backdrop:duration-*` to match, or the backdrop's fade gets cut off.
- A dialog that's open in the server's HTML fades in once after hydration.
- Closes Origami doesn't start, such as a `<form method="dialog">` submit or calling `close()` on the element, skip the exit.

## Sheet

```ts
import { SheetParts } from "#ui/sheet";
import { Button } from "#ui/button";
```

Sheet is a full-height modal panel against the right or left edge of the screen, for filters, details or navigation, over Origami's [Dialog](../origami-ui/dialog/README.md). It works like [Dialog](#dialog), with its own parts: `SheetParts` holds all nine for a component's `imports`; each is also exported on its own.

```html
<div foldSheet [(open)]="open">
  <button foldSheetTrigger>Filters</button>
  <dialog foldSheetContent>
    <form class="contents" (submit)="apply($event)">
      <div foldSheetHeader>
        <h2 foldSheetTitle>Filters</h2>
        <p foldSheetDescription>12 contracts match.</p>
      </div>
      <div foldSheetBody class="grid gap-4">
        <div foldField>
          <label foldFieldLabel>Search</label>
          <input foldInput [formField]="f.search" />
        </div>
        …
      </div>
      <div foldSheetFooter>
        <button foldButton variant="primary" type="submit">Apply</button>
      </div>
    </form>
  </dialog>
</div>
```

- `Sheet`: the root, with `open` (two-way), `dismissible` and `openChange`. It's `display: contents` unless it's on the `<dialog>` itself. Escape and a backdrop click close the sheet while it's dismissible.
- `SheetTrigger`: opens the sheet. It takes Button's `variant`, `size` and `class`, plus `id`, `disabled` and `focusableWhenDisabled`.
- `SheetContent`: the modal `<dialog>` over a scrim, the viewport's full height and 320px wide, or the viewport's width when that's narrower, against the right edge, or the left one with `side="left"`. A border separates it from the page. It lays its children out in a column, 20px apart. It takes `id`, `returnFocus`, `side`, `closeButton` and `closeLabel`. When it closes, focus returns to what had it before the sheet opened, or to `returnFocus` if that can take focus; see Origami's [Focus](../origami-ui/dialog/README.md#focus) for when focus was lost.
- `SheetHeader`: stacks the title and description, clear of the close button.
- `SheetTitle` and `SheetDescription`: name and describe the sheet for assistive technology. They take `id`.
- `SheetBody`: the part that scrolls when the sheet runs out of height, so the header and footer stay in place. Without a Body, the whole sheet scrolls, close button and footer included.
- `SheetFooter`: the actions, right-aligned, at the bottom of the sheet.
- `SheetClose`: closes the sheet, whatever `dismissible` says. Secondary by default; it takes Button's inputs, `disabled` and `focusableWhenDisabled`.

Content ends with the same corner close button as [Dialog](#dialog)'s: named by `closeLabel`, disabled but focusable while the sheet isn't dismissible, and removed by `[closeButton]="false"`. Its `class` replaces the width or the spacing. A navigation sheet with a visually hidden title:

```html
<div foldSheet [(open)]="navOpen">
  <button foldSheetTrigger variant="ghost">Menu</button>
  <dialog foldSheetContent side="left" [closeButton]="false" class="w-72 gap-0 p-0">
    <div foldSheetHeader class="sr-only"><h2 foldSheetTitle>Navigation</h2></div>
    <nav class="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2">
      <a href="/contracts" (click)="navOpen.set(false)">Contracts</a>
      …
    </nav>
  </dialog>
</div>
```

`side` is physical: a `right` sheet stays on the right in a right-to-left page, while the close button and the Header's room for it sit at the inline end.

Everything Dialog's guidance says applies to a sheet too, with the Sheet parts: [forms](#forms-in-a-dialog) (initial focus, `[readOnly]` fields and a guarded submit handler while saving), [opening from code](#opening-a-dialog-from-code) through `hostDirectives: [Sheet]`, and [motion](#motion), except that a sheet slides in from its side and fades over 200ms, and stays modal for those 200ms when it closes.

## Field

```ts
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { Input } from "#ui/input";
import { Textarea } from "#ui/textarea";
```

Field lays out a label, a control, its descriptions and its errors, over Origami's [Field](../origami-ui/field/README.md), which links them for assistive technology and reads the control's [Signal Forms](https://angular.dev/guide/forms/signals/overview) state. Bind the control with `[formField]`:

```html
<div foldField #email="foldField">
  <label foldFieldLabel>Email</label>
  <input foldInput type="email" [formField]="f.email" placeholder="you@example.com" />
  <p foldFieldDescription>We only use it for receipts.</p>
  @if (email.state.errorsShown()) {
  <p foldFieldError>{{ email.state.errors()[0]?.message }}</p>
  }
</div>
<div foldField>
  <label foldFieldLabel>Notes</label>
  <textarea foldTextarea rows="4" [formField]="f.notes"></textarea>
</div>
```

- `Field`: the root, a column with a 6px gap. Its template reference, `#email="foldField"` with your prefix, has `state`: Origami's Field state, with `errorsShown`, `errors`, `invalid`, `touched`, `disabled` and `required` signals. It takes `orientation`, `vertical` (default) or `horizontal`; see [Option rows](#option-rows).
- `FieldLabel`: in body text at weight 600, or 400 in a horizontal Field. On a `<label>` it names the control: use a `<label>` for Input, Textarea, Checkbox, Switch and NumberField, or they're left unnamed. On another element, such as a `<span>`, it names a group, such as a [RadioGroup](#radiogroup), or a [Slider](#slider), which Origami points `aria-labelledby` at; that label isn't clickable. It dims while the Field is disabled. It takes `id`.
- `FieldDescription`: a 12px muted hint. It takes `id`.
- `FieldError`: a 12px message in the destructive text color, after an alert icon hidden from assistive technology. It always shows while it's mounted, so put it under `@if (field.state.errorsShown())`; the text is yours. It takes `id`.

Origami's Field README describes the wiring, when errors show and the server rendering. Field wraps any control that joins an Origami Field, not only fold's.

Field's state needs Signal Forms' `[formField]` on the control. With reactive forms' `[formControl]`, `ngModel` or a bare native `disabled`, every state signal stays `false`: no error border, no `errorsShown` to gate errors on, and no dimmed label. Native `:disabled` and `[readonly]` still style the control.

A disabled Field also dims the labels of Fields nested inside it, and a horizontal Field sets theirs at weight 400.

NumberField and Slider go in a vertical Field: a NumberField under a `<label>`, a Slider under a `<span>`.

The label dims only from the Field's Signal Forms disabled state: a Checkbox disabled through `[disabled]` without `[formField]` dims itself, not its label.

### Option rows

`orientation="horizontal"` lays a Checkbox or Switch out as an option row: the control first, then the label beside it, at least 24px tall and 8px from the control, with descriptions and errors under the label, aligned with its text:

```html
<div foldField orientation="horizontal" #terms="foldField">
  <button foldCheckbox [formField]="f.terms"></button>
  <label foldFieldLabel>Accept the leasing terms</label>
  <p foldFieldDescription>You can cancel within 14 days.</p>
  @if (terms.state.errorsShown()) {
  <p foldFieldError>{{ terms.state.errors()[0]?.message }}</p>
  }
</div>
```

The layout is a two-column grid that places children by position: the first child takes the first column and every later one the second, so put the control first. A label that wraps centers the control on its lines. There's no label-first layout, such as a settings row with the switch at the end.

## Input

`Input` styles a native `<input>`: 32px, the surface fill, a 1px border that darkens on hover, the green focus ring, a destructive border while the Field shows errors, a dashed border without fill when `readonly`, and 50% opacity when disabled. Inside a Field, Origami gives it an `id`, `aria-describedby` and `aria-invalid`; it takes `id`. It also works without a Field, keeping your own attributes:

```html
<input foldInput type="search" aria-label="Search" class="ps-8" />
```

Use it for text-like types, such as `text`, `email`, `password`, `search`, `number` and `date`. Checkbox, radio and file inputs don't fit its look.

`inputClasses` is the look without the height, shared with Textarea.

## Textarea

`Textarea` styles a native `<textarea>` with Input's look, at least 64px tall and resizable vertically; `rows` sets its height above that. It takes `id`. It imports `inputClasses` from `../input`, so adding `textarea` adds `input`.

## Checkbox

```ts
import { Checkbox } from "#ui/checkbox";
```

`Checkbox` is a 16px box on a native `<button>`, over Origami's [Checkbox](../origami-ui/checkbox/README.md), which owns its behavior: a click or Space toggles it, Enter doesn't. It's the box only, so content inside it is dropped. Name it with a Field `<label>`, which also toggles it on click, or with `aria-label`:

```html
<div foldField orientation="horizontal">
  <button foldCheckbox [formField]="f.includeVat"></button>
  <label foldFieldLabel>Include VAT</label>
</div>

<button foldCheckbox aria-label="Select LC-2041" [(checked)]="selected"></button>
```

It takes `checked` (two-way), `disabled`, `focusableWhenDisabled` and `id`, and emits `checkedChange` and `touch`; `[formField]` binds them. Checked, it fills with the foreground color and shows a check icon hidden from assistive technology; it's never green. The focus ring is green, an invalid box has a destructive border, a readonly one a dashed border without fill (a checked one keeps its fill), and a disabled one 50% opacity. There's no mixed state.

- **Readonly only in a Field.** Origami sets `aria-readonly` from Signal Forms inside a Field; outside one, a readonly checkbox looks editable.
- **Render the error.** When a validator rejects a checked box, its destructive border sits against the fill, faint in the dark theme, so render the Field's FieldError as the cue.
- **Target size.** In an option row, the label's click and the 8px gap make the 16px box meet WCAG 2.5.8's spacing exception. In denser layouts, such as a table cell with another control within 4px, give it room yourself.

## Switch

```ts
import { Switch } from "#ui/switch";
```

`Switch` is a 36×20 track with a 14px thumb on a native `<button>`, over Origami's [Switch](../origami-ui/switch/README.md): a click, Enter or Space toggles it. It has Checkbox's inputs, outputs, naming and notes, and the same looks: on, the track fills with the foreground color and the thumb slides to the end, following the text direction.

In forced-colors mode, such as Windows High Contrast, the thumb uses the system button text color, so it stays visible against the track.

```html
<div foldField orientation="horizontal">
  <button foldSwitch [formField]="f.autoRenew"></button>
  <label foldFieldLabel>Renew automatically</label>
  <p foldFieldDescription>Renews 30 days before the end date.</p>
</div>
```

## RadioGroup

```ts
import { RadioGroup, RadioGroupItem } from "#ui/radio-group";
```

`RadioGroup` is a column of `RadioGroupItem`s, 8px apart, over Origami's [RadioGroup](../origami-ui/radio-group/README.md), which owns the behavior: one tab stop, arrow keys that move and select, and skipping disabled items. In a Field, name it with a FieldLabel on a `<span>`:

```html
<div foldField #cycle="foldField">
  <span foldFieldLabel>Billing cycle</span>
  <div foldRadioGroup [formField]="f.cycle">
    @for (option of cycles; track option.value) {
    <button foldRadioGroupItem [value]="option.value" [disabled]="option.locked">
      {{ option.label }}
    </button>
    }
  </div>
  @if (cycle.state.errorsShown()) {
  <p foldFieldError>{{ cycle.state.errors()[0]?.message }}</p>
  }
</div>

<div foldRadioGroup aria-label="Density" [(value)]="density" class="flex-row gap-4">
  <button foldRadioGroupItem value="compact">Compact</button>
  <button foldRadioGroupItem value="comfortable">Comfortable</button>
</div>
```

- `RadioGroup`: takes `value` (two-way), `disabled` and `class`, and emits `valueChange` and `touch`. Its `focus()` focuses the item with the tab stop, so Signal Forms' `focusBoundControl()` reaches the group. Its `class` can change the layout, such as `flex-row gap-4`.
- `RadioGroupItem`: a whole row on a native `<button>`: a 16px circle and its content, which names it. It takes `value` (required), `disabled`, `focusableWhenDisabled` and `class`. Give each item a distinct value.

A selected item shows a dot in the foreground color, or the system button text color in forced-colors mode; the focus ring goes around the circle. The group's invalid and readonly looks reach only its own items, so a group nested inside another keeps its own. Like Checkbox, its readonly look needs a Field.

The item's whole content is its accessible name, so a hint inside an item is read as part of it; use `aria-describedby` for longer hints. A multi-line item centers its circle on its lines.

## NumberField

```ts
import { NumberFieldParts } from "#ui/number-field";
import { form, max, min, required } from "@angular/forms/signals";

readonly deposit = form(signal({ amount: null as number | null }), (p) => {
  required(p.amount, { message: "Enter an amount" });
  min(p.amount, 0, { message: "It can't be negative" });
  max(p.amount, 1000, { message: "Up to 1.000 €" });
});
```

`NumberField` is a 32px box with Input's look over Origami's [Number field](../origami-ui/number-field/README.md), which owns the behavior: a plain text box that parses and formats numbers in the locale, and steps with ArrowUp and ArrowDown and the − and + buttons; there's no wheel or press-and-hold stepping. The box holds a borderless `NumberFieldInput`, optional `NumberFieldDecrement` and `NumberFieldIncrement` buttons, and optional `NumberFieldAdornment`s, such as `€`; its focus ring and invalid border go round all of them.

<!-- prettier-ignore -->
```html
<div foldField #amount="foldField">
  <label foldFieldLabel>Amount (€)</label>
  <div
    foldNumberField
    [formField]="deposit.amount"
    minimumFractionDigits="2"
    maximumFractionDigits="2"
  >
    <button foldNumberFieldDecrement aria-label="Decrease amount"></button>
    <span foldNumberFieldAdornment>€</span>
    <input foldNumberFieldInput placeholder="0,00" />
    <button foldNumberFieldIncrement aria-label="Increase amount"></button>
  </div>
  @if (amount.state.errorsShown()) {
    @switch (amount.state.errors()[0]?.kind) {
      @case ("numberInvalid") {
        <p foldFieldError>That isn't an amount</p>
      }
      @case ("numberIncomplete") {
        <p foldFieldError>Finish the amount</p>
      }
      @default {
        <p foldFieldError>{{ amount.state.errors()[0]?.message }}</p>
      }
    }
  }
</div>

<div foldNumberField [(value)]="tickets" min="1" maximumFractionDigits="0">
  <input foldNumberFieldInput aria-label="Tickets" />
</div>
```

- `NumberField`: the box. It takes `value` (two-way, `number | null`), `locale` (default your app's `LOCALE_ID`), `min`, `max`, `step`, `minimumFractionDigits`, `maximumFractionDigits`, `useGrouping`, `disabled`, `readonly` and `class`, and emits `valueChange` and `touch`; `[formField]` binds the value, the bounds, `disabled` and `readonly`, so set them in the schema, not as attributes beside it. Its `focus()` focuses the input, so Signal Forms' `focusBoundControl()` reaches it.
- `NumberFieldInput`: the text, start-aligned with tabular figures; `class="text-end"` puts it at the end. Inside a Field it's the Field's control. Origami reads its `id` once, as a static attribute: write `id="…"` or let the Field generate one, not `[id]`.
- `NumberFieldDecrement`, `NumberFieldIncrement`: square ghost buttons with a − or + icon, as tall as the box's inside. They're out of the Tab order. A mouse press keeps focus in the input, so the ring stays on the box while stepping; a touch or pen press focuses the button natively, without a ring. Give each a localized `aria-label`, or a screen reader meets an unnamed button. At a limit, or while readonly, a button is dimmed and does nothing; a disabled field dims once, as a whole.
- `NumberFieldAdornment`: a muted sign hidden from assistive technology, so say the unit in the label, as in "Amount (€)". Before the input, it sits 8px before the number; after it, it sits at the end of the box, not after the digits.

Put the parts in any order. The split layout above is the usual one; `[input][−][+]` keeps the number where a plain Input's text starts. Leading parts move the number in by their width. For a 28 or 36px box, add `class="h-7"` or `class="h-9"`; the buttons follow.

Give every schema rule a `message`: a `max(p.x, 1000)` without one shows an empty FieldError in the `@default` branch. Origami's own errors, `numberInvalid` and `numberIncomplete`, have no message, so the template names them.

A value typed out of range stays, and the schema reports it; the buttons and keys only step inside the bounds. In Greek and other locales whose group separator is `.`, `12.50` is reported as `numberInvalid`, and `1.500` reads as 1500. Precision is a JavaScript `number`'s, about 15 significant digits. There's no `ngModel` or reactive forms support: use `[formField]` or `[(value)]`. [Origami's README](../origami-ui/number-field/README.md) describes parsing, stepping, hydration and the rest.

## Slider

```ts
import { Slider, SliderThumb } from "#ui/slider";
```

`Slider` is a single-thumb horizontal slider over Origami's [Slider](../origami-ui/slider/README.md), which owns the behavior: arrow keys, PageUp, PageDown, Home and End, presses and drags anywhere on the rail, and touch drags that leave vertical scrolling to the page. It draws a 4px rail with a foreground-colored fill up to a 16px thumb, inside a 24px-tall press area; the thumb stays inside the slider's box at both ends. Write a `SliderThumb` inside it:

```html
<div foldField>
  <div class="flex items-baseline justify-between">
    <span foldFieldLabel>Zoom</span>
    <output class="tabular-nums">{{ settings.zoom().value() }}%</output>
  </div>
  <div foldSlider [formField]="settings.zoom" step="10">
    <div foldSliderThumb [attr.aria-valuetext]="settings.zoom().value() + '%'"></div>
  </div>
  <p foldFieldDescription>Scales the org chart.</p>
</div>

<div foldSlider [(value)]="zoom" min="20" max="180" step="10" #slider="foldSlider">
  <div foldSliderThumb aria-label="Zoom" [attr.aria-valuetext]="slider.state.value() + '%'"></div>
</div>
```

- `Slider`: takes `value` (two-way), `min`, `max`, `step`, `disabled` and `class`, and emits `valueChange` and `touch`; `[formField]` binds the value, the bounds and `disabled`, so set the bounds with the schema's `min()` and `max()`. Its template reference, `#slider="foldSlider"` with your prefix, has `state`, with `value`, `percent`, `disabled` and `dragging` signals. Its `focus()` focuses the thumb.
- `SliderThumb`: the focusable `role="slider"` element. Put `aria-valuetext` on it, such as `"120%"`, and `aria-label` when no Field label names it. It takes `class`.

There's no value part: show the value in an `<output>` beside the label, as above. The thumb rings green on focus; an invalid thumb has a destructive border, a readonly one a dashed border, and a disabled slider 50% opacity.

- **Readonly only in a Field.** Like Checkbox, the readonly look comes from Signal Forms inside a Field; there's no `readonly` input.
- **No commit event.** `valueChange` fires on every key and every drag step; debounce it if you save on change.
- **Before hydration.** A press on the rail of the server-rendered page is replayed once after hydration and moves the thumb there; a drag held across hydration doesn't resume, so press again to drag.
- **Touch on the rail.** A touch that starts on the rail away from the thumb sets the value at once, even if the gesture turns into a vertical scroll: a scroll started at 75% of a slider at 100 of 20–180 left it at 140. One started on the thumb keeps the value.
- **Forced colors.** In forced-colors mode, such as Windows High Contrast, the rail, fill and thumb keep system colors, and an invalid thumb looks like a valid one: the Field's error text carries the state.

[Origami's README](../origami-ui/slider/README.md) describes the keys, pointer handling, hydration and the rest.

## Limitations

- Re-running `add` can't tell untouched files from edited ones, because the CLI reformats them with your Prettier; see `--existing`.
- The dialog scrim is set on `::backdrop`, which needs to inherit custom properties. Chromium, Firefox and WebKit do.
- `tailwind-variants` adds about 13 kB gzipped to your bundle.
- `ng add` adds `imports` at the top of your `package.json`.
- Nx workspaces are untested.
- No range, multi-thumb or vertical Slider, and no ticks or marks; no press-and-hold or wheel stepping in NumberField.

## Developing this package

`components/` holds the component sources the schematics copy, authored with the placeholder prefix `fold__` (`fold__Button`), which `add` replaces with yours. `schematics/` holds `ng-add` and `add`.

```sh
pnpm --filter @loozo/fold-ui test           # typecheck schematics and components, build, schematic tests
pnpm --filter @loozo/fold-ui test:consumer  # ng new → ng add → add → production build → Chromium smoke
```

`test:consumer` needs network access for the app's `npm install`, and runs its build and browser steps under Origami's machine-wide gate lock.
