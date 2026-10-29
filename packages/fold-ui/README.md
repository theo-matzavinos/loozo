# @loozo/fold-ui

Styled Angular components for back-office apps, built on [Origami](../origami-ui/README.md)'s headless primitives and themed with Tailwind CSS v4. fold doesn't ship a component library you import: its schematics copy each component's source into your app, where you own and edit it.

Each fold part is a directive that adds classes, usually composing an Origami directive; layout-only parts, such as AlertDialog's Header and Footer, compose none. Origami keeps the behavior, accessibility and server rendering; fold adds the look: neutral greys, one green for the primary action, orange only for destructive actions, compact 28, 32 and 36px controls, and dark and light themes.

**Status:** experimental. MIT license. It currently has Button (with ButtonLink), AlertDialog, Dialog, and Field with Input and Textarea. There's no loading state, Nx support or way to update a theme you already added.

## Requirements

- An Angular 22 application with Tailwind CSS v4 set up, such as one made by `ng new --style=tailwind`, or after `ng add tailwindcss`. Tested with Angular 22.2.2 and Tailwind CSS 4.3.3.
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
ng generate @loozo/fold-ui:add --names button alert-dialog dialog
ng generate @loozo/fold-ui:add --names field input textarea
```

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

`add` also copies the components a component imports: AlertDialog's and Dialog's buttons are styled by Button's `ButtonStyle`, so adding `alert-dialog` or `dialog` adds `button` too; Textarea shares Input's look, so adding `textarea` adds `input`; and every component merges its classes with `cn`, so the first `add` adds `cn`. Components import each other as `../button`.

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

Every part except the AlertDialog and Dialog roots takes a `class` input that's merged over fold's classes, so a conflicting utility of yours wins:

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

Every part sets a `data-slot` attribute, such as `data-slot="button"` or `data-slot="alert-dialog-content"`, to target it from CSS or from a parent's classes, like `[&_[data-slot=button]]:w-full`.

State is styled from the attributes Origami sets: a disabled button has `data-disabled`, so `data-disabled:` and `not-data-disabled:` variants key on it. A Field has `data-invalid`, `data-disabled` and `data-required` and its control `aria-invalid`; Input and Textarea also style native `:disabled` and `[readonly]`.

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
          <input foldInput autofocus [readOnly]="pending()" [formField]="f.reference" />
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

- **Initial focus.** The browser focuses an `autofocus` element, else the first focusable one. Chromium counts a Body that overflows as focusable, so it focuses the Body before the fields inside it, depending on the viewport's height. Put `autofocus` on the first field of a form dialog.
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

## Field

```ts
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { Input } from "#ui/input";
import { Textarea } from "#ui/textarea";
```

Field stacks a label, a control, its descriptions and its errors, over Origami's [Field](../origami-ui/field/README.md), which links them for assistive technology and reads the control's [Signal Forms](https://angular.dev/guide/forms/signals/overview) state. Bind the control with `[formField]`:

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

- `Field`: the root, a column with a 6px gap. Its template reference, `#email="foldField"` with your prefix, has `state`: Origami's Field state, with `errorsShown`, `errors`, `invalid`, `touched`, `disabled` and `required` signals.
- `FieldLabel`: a `<label>` that names the control, in body text at weight 600. It dims while the Field is disabled. It takes `id`.
- `FieldDescription`: a 12px muted hint. It takes `id`.
- `FieldError`: a 12px message in the destructive text color, after an alert icon hidden from assistive technology. It always shows while it's mounted, so put it under `@if (field.state.errorsShown())`; the text is yours. It takes `id`.

Origami's Field README describes the wiring, when errors show and the server rendering. Field wraps any control that joins an Origami Field, not only fold's.

Field's state needs Signal Forms' `[formField]` on the control. With reactive forms' `[formControl]`, `ngModel` or a bare native `disabled`, every state signal stays `false`: no error border, no `errorsShown` to gate errors on, and no dimmed label. Native `:disabled` and `[readonly]` still style the control.

A disabled Field also dims the labels of Fields nested inside it.

## Input

`Input` styles a native `<input>`: 32px, the surface fill, a 1px border that darkens on hover, the green focus ring, a destructive border while the Field shows errors, a dashed border without fill when `readonly`, and 50% opacity when disabled. Inside a Field, Origami gives it an `id`, `aria-describedby` and `aria-invalid`; it takes `id`. It also works without a Field, keeping your own attributes:

```html
<input foldInput type="search" aria-label="Search" class="ps-8" />
```

Use it for text-like types, such as `text`, `email`, `password`, `search`, `number` and `date`. Checkbox, radio and file inputs don't fit its look.

`inputClasses` is the look without the height, shared with Textarea.

## Textarea

`Textarea` styles a native `<textarea>` with Input's look, at least 64px tall and resizable vertically; `rows` sets its height above that. It takes `id`. It imports `inputClasses` from `../input`, so adding `textarea` adds `input`.

## Limitations

- Re-running `add` can't tell untouched files from edited ones, because the CLI reformats them with your Prettier; see `--existing`.
- The dialog scrim is set on `::backdrop`, which needs to inherit custom properties. Chromium, Firefox and WebKit do.
- `tailwind-variants` adds about 13 kB gzipped to your bundle.
- `ng add` adds `imports` at the top of your `package.json`.
- Nx workspaces are untested.

## Developing this package

`components/` holds the component sources the schematics copy, authored with the placeholder prefix `fold__` (`fold__Button`), which `add` replaces with yours. `schematics/` holds `ng-add` and `add`.

```sh
pnpm --filter @loozo/fold-ui test           # typecheck schematics and components, build, schematic tests
pnpm --filter @loozo/fold-ui test:consumer  # ng new → ng add → add → production build → Chromium smoke
```

`test:consumer` needs network access for the app's `npm install`, and runs its build and browser steps under Origami's machine-wide gate lock.
