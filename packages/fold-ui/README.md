# @loozo/fold-ui

Styled Angular components for back-office apps, built on [Origami](../origami-ui/README.md)'s headless primitives and themed with Tailwind CSS v4. fold doesn't ship a component library you import: its schematics copy each component's source into your app, where you own and edit it.

Each fold part is a directive that adds classes, usually composing an Origami directive; layout-only parts, such as AlertDialog's Header and Footer, compose none. Origami keeps the behavior, accessibility and server rendering; fold adds the look: neutral greys, one green for the primary action, orange only for destructive actions, compact 28, 32 and 36px controls, and dark and light themes.

**Status:** experimental. MIT license. It currently has Button (with ButtonLink), AlertDialog, Dialog, Sheet, Field with Input, Textarea, Checkbox, Switch, RadioGroup, NumberField, OtpField, Slider, Select and Combobox, Tabs, Tooltip and Popover, Menu, Toast, and ScrollArea, Avatar and Progress. There's no loading state, Nx support or way to update a theme you already added.

## Requirements

- An Angular 22 application with Tailwind CSS v4 set up, such as one made by `ng new --style=tailwind`, or after `ng add tailwindcss`. Tested with Angular 22.3.0 and Tailwind CSS 4.3.3.
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
ng generate @loozo/fold-ui:add --names otp-field
ng generate @loozo/fold-ui:add --names select combobox
ng generate @loozo/fold-ui:add --names tabs tooltip popover
ng generate @loozo/fold-ui:add --names menu
ng generate @loozo/fold-ui:add --names toast
ng generate @loozo/fold-ui:add --names scroll-area avatar progress
```

NumberField, Slider, Combobox, OtpField, Menu, Toast, ScrollArea, Avatar and Progress import `@loozo/origami-ui/number-field`, `/slider`, `/combobox`, `/otp-field`, `/menu`, `/toast`, `/scroll-area`, `/avatar` and `/progress`, which no published Origami has yet (npm has 0.0.4); Select, Tabs, Tooltip and Popover import only what 0.0.4 has. An app set up with an older Origami needs its `@loozo/origami-ui` raised first, since `add` doesn't change dependencies.

Without `--names`, it asks which components to add. Each component is a folder under the `fold.json` path, with an `index.ts` that re-exports its parts and one file per part:

```text
src/ui/
├── theme.css
├── cn/
│   ├── index.ts
│   └── cn.ts
├── popup/
│   ├── index.ts
│   ├── popup.ts
│   └── option.ts
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

`add` also copies the components a component imports: AlertDialog's, Dialog's and Sheet's buttons are styled by Button's `ButtonStyle`, so adding `alert-dialog`, `dialog` or `sheet` adds `button` too; Textarea shares Input's look, so adding `textarea` adds `input`; Select, Combobox, Tooltip and Popover share the floating layers' look and motion from `popup`, so adding any of them adds `popup`, Combobox's input is Input's look, so adding `combobox` adds `input` too, and PopoverTrigger is styled by `ButtonStyle`, so adding `popover` adds `button`; MenuTrigger is styled by `ButtonStyle` and the panel and rows come from `popup`, so adding `menu` adds `button` and `popup`; Toast's buttons use `Button` and its cards `popup`, so adding `toast` adds `button` and `popup`; and every component merges its classes with `cn`, so the first `add` adds `cn`. Components import each other as `../button`.

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

To re-theme, change the token values in your copy; when you add a text size, radius, shadow or animation, also add its name to `cn` (see [Class merging](#class-merging-and-slots)). Hover, pressed and tint colors are mixed from the tokens with `color-mix()`, and the radius ladder derives from `--radius`, so they follow. The theme also adds:

- utilities such as `bg-primary`, `text-muted-foreground`, `border-input`, `rounded-control`, `rounded-dialog` and `shadow-edge`.
- a five-step type ladder: `text-display` (28px), `text-headline` (20px), `text-title` (15px), `text-body` (13px) and `text-label` (12px), each with its line height and weight. The body text is 13px, set on `<body>`, so `rem` stays 16px and Tailwind's spacing keeps its sizes.
- `dark:` and `light:` variants that follow the classes instead of the system preference. `dark:` doesn't follow an explicit `.dark` nested inside `.light`.
- `animate-popup-in` and `animate-popup-out`, the floating layers' 120ms fade and scale from 96%; see [Floating layers](#floating-layers).
- the Hanken Grotesk variable font, imported from `@fontsource-variable/hanken-grotesk`.

Tailwind's default colors and `text-*` sizes stay available.

## Class merging and slots

Every part except the AlertDialog, Dialog and Sheet roots and TooltipTrigger takes a `class` input that's merged over fold's classes, so a conflicting utility of yours wins:

```html
<button foldButton class="px-6">Wider</button>
```

One exception: AvatarFallback's loading delay and Progress's unknown sweep are component styles, which an ordinary `animate-*` utility doesn't override. Use Tailwind's important form, `animate-none!`, as their sections show, or edit the motion rule in your copy. ScrollArea's `class` is on its root, whose layout is fold's; see [ScrollArea](#scrollarea).

The merging comes from `cn`, a component like the others. `cn/cn.ts` exports `tv`, `tailwind-variants`' variant builder, and `cn(...classes)`, which joins classes and keeps the last of conflicting utilities. Both are configured with the theme's text sizes, radii, shadows and animations, which Tailwind's defaults don't have: without them, `text-title` would count as a text color and cancel `text-foreground`. Use them for your own components too:

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

`cn.ts` lists the `--text-*`, `--radius-*`, `--shadow-*` and `--animate-*` names of `theme.css`. Keep them in sync: when you add one to the theme, add its name to `cn.ts`, or its utilities won't merge with their peers.

Every part except TooltipTrigger, which shares its button's, sets a `data-slot` attribute, such as `data-slot="button"` or `data-slot="alert-dialog-content"`, to target it from CSS or from a parent's classes, like `[&_[data-slot=button]]:w-full`. The decorative markup inside Checkbox, Switch, RadioGroupItem and Slider has its own: `checkbox-indicator` (the check) and `checkbox-mixed-indicator` (the minus), `switch-thumb`, `radio-group-indicator`, and `slider-track`, `slider-rail` and `slider-fill`. NumberField's parts are `number-field`, `number-field-input`, `number-field-decrement`, `number-field-increment` and `number-field-adornment`; Slider's are `slider` and `slider-thumb`. OtpField's are `otp-field` and `otp-field-input`, with `otp-field-cell` for each cell and, inside a cell, `otp-field-dot` (a masked digit) and `otp-field-caret` (the bar). Select's are `select`, `select-trigger`, `select-content` and `select-option`, with `select-value` and `select-icon` inside the Trigger and `select-option-text` and `select-option-indicator` inside an option; Combobox's are `combobox`, `combobox-input`, `combobox-trigger`, `combobox-content`, `combobox-option` (with `combobox-option-text` and `combobox-option-indicator`) and `combobox-empty`. Tabs' are `tabs`, `tabs-list`, `tabs-trigger` (with `tabs-indicator`, the dot) and `tabs-panel`; Tooltip's are `tooltip` and `tooltip-content`; Popover's are `popover`, `popover-trigger` and `popover-content`. Menu's are `menu`, `menu-trigger`, `menu-content`, `menu-item`, `menu-link`, `menu-checkbox-item` (with `menu-checkbox-item-indicator`), `menu-radio-group`, `menu-radio-item` (with `menu-radio-item-indicator`), `menu-group`, `menu-group-label`, `menu-separator`, `menu-sub`, `menu-sub-trigger` (with `menu-sub-trigger-icon`) and `menu-shortcut`. Toast's are `toast-region`, `toast-list`, `toast` (with `toast-icon`, `toast-title` and `toast-description`) and `toast-close`; a toast's action is a `button`. ScrollArea's are `scroll-area`, with `scroll-area-viewport`, `scroll-area-content`, one `scroll-area-scrollbar` per axis and its `scroll-area-thumb` in its template; Avatar's are `avatar`, `avatar-image` and `avatar-fallback`; Progress's are `progress`, with `progress-fill` inside.

State is styled from the attributes Origami sets: a disabled button has `data-disabled`, so `data-disabled:` and `not-data-disabled:` variants key on it. A Field has `data-invalid`, `data-disabled` and `data-required` and its control `aria-invalid`, plus `aria-readonly` on a readonly Checkbox, Switch or RadioGroup; Input and Textarea also style native `:disabled` and `[readonly]`. A checked Checkbox, an on Switch and a selected RadioGroupItem have `data-checked`; a mixed Checkbox has `data-mixed` and no `data-checked`. A NumberField has no state attributes of its own: its box reads its input's `:disabled`, `[readonly]`, `[aria-invalid=true]` and `:focus-visible` through `:has()`, and a − or + button at a limit or while readonly has `data-disabled` without being natively disabled. An OtpField's cells have `data-filled`, `data-caret` and `data-selected`; like NumberField, the row reads its input's `:focus-visible`, `:disabled`, `[readonly]` and `[aria-invalid=true]` through `:has()`. A Slider has `data-disabled`, `data-dragging` and the `--og-slider-percent` custom property, and its thumb `aria-invalid` and `aria-readonly`. A Select Trigger has `aria-expanded`, `aria-invalid`, `aria-readonly`, `data-disabled` and, while nothing is chosen, `data-placeholder`; a Combobox input styles native `:disabled` and `[readonly]` like Input. An option has `data-active` while highlighted, `data-selected` and `data-disabled`, and a list `data-entering` and `data-leaving` while it animates. A TabsTrigger has `aria-selected`, `data-disabled` and its root's `data-orientation`, and a TabsList `aria-orientation`; Tooltip and Popover Content have `data-entering` and `data-leaving`, and a PopoverTrigger `aria-expanded`. Menu rows style `:focus`, the real focus the mouse moves too; a checked checkbox or radio item has `data-checked`, a disabled row `data-disabled`, a destructive item `data-variant="destructive"` and an open MenuSubTrigger `aria-expanded`, and MenuContent has `data-side`, `data-entering` and `data-leaving`. A toast has `data-kind`, `data-entering` and `data-leaving`, is `inert` through its exit, and sets `--toast-index`, its place in the deck, 0 for the newest. A ScrollArea has `data-overflow-x` and `data-overflow-y` while its viewport overflows that way, and each scrollbar `data-orientation` and, while shown, `data-visible`. An Avatar has `data-status`: `idle`, `loading`, `loaded` or `error`. A Progress has `data-complete` or `data-indeterminate`, and the `--og-progress-percent` custom property while its value is known. fold's Field adds `data-orientation`.

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
- `FieldLabel`: in body text at weight 600, or 400 in a horizontal Field. On a `<label>` it names the control: use a `<label>` for Input, Textarea, Checkbox, Switch, NumberField and OtpField, or they're left unnamed. On another element, such as a `<span>`, it names a group, such as a [RadioGroup](#radiogroup), or a [Slider](#slider), which Origami points `aria-labelledby` at; that label isn't clickable. It dims while the Field is disabled. It takes `id`.
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

It takes `checked` and `mixed` (both two-way), `disabled`, `focusableWhenDisabled` and `id`, and emits `checkedChange`, `mixedChange` and `touch`; `[formField]` binds all but `mixed`. Checked, it fills with the foreground color and shows a check icon hidden from assistive technology; it's never green. Mixed, it has the same fill with a minus instead, and `aria-checked="mixed"`. The focus ring is green, an invalid box has a destructive border, a readonly one a dashed border without fill (a checked or mixed one keeps its fill), and a disabled one 50% opacity. In forced-colors mode, such as Windows High Contrast, the box takes the system colors and the check or minus the system text color.

- **Readonly only in a Field.** Origami sets `aria-readonly` from Signal Forms inside a Field; outside one, a readonly checkbox looks editable.
- **Render the error.** When a validator rejects a checked box, its destructive border sits against the fill, faint in the dark theme, so render the Field's FieldError as the cue.
- **Target size.** In an option row, the label's click and the 8px gap make the 16px box meet WCAG 2.5.8's spacing exception. In denser layouts, such as a table cell with another control within 4px, give it room yourself.

### Select all

A select-all parent derives `checked` and `mixed` from its children, and its handler writes them all:

```html
<div foldField orientation="horizontal">
  <button
    foldCheckbox
    aria-controls="invoice-0412 invoice-0413 invoice-0414"
    [checked]="all()"
    [mixed]="some()"
    (checkedChange)="selectAll($event)"
  ></button>
  <label foldFieldLabel>Select all invoices</label>
</div>
<div class="grid gap-1 ps-6">
  @for (invoice of invoices; track invoice) {
  <div foldField orientation="horizontal">
    <button
      foldCheckbox
      [id]="'invoice-' + invoice"
      [checked]="selected().has(invoice)"
      (checkedChange)="select(invoice, $event)"
    ></button>
    <label foldFieldLabel>Invoice {{ invoice }}</label>
  </div>
  }
</div>
```

```ts
readonly invoices = ["0412", "0413", "0414"];
readonly selected = signal<ReadonlySet<string>>(new Set(["0412"]));
readonly all = computed(() => {
  for (const invoice of this.invoices) {
    if (!this.selected().has(invoice)) {
      return false;
    }
  }

  return true;
});
readonly some = computed(() => this.selected().size > 0 && !this.all());

selectAll(checked: boolean): void {
  if (checked) {
    this.selected.set(new Set(this.invoices));

    return;
  }

  this.selected.set(new Set());
}

select(invoice: string, checked: boolean): void {
  const next = new Set(this.selected());

  if (checked) {
    next.add(invoice);
  } else {
    next.delete(invoice);
  }

  this.selected.set(next);
}
```

A click or Space on the mixed parent checks every invoice. Origami's [mixed state and select-all](../origami-ui/checkbox/README.md#mixed-state-and-select-all) has the rest: why a one-way `[mixed]` comes back only when `some()` changes, how to derive the parent when a child is disabled, and how `mixed` works with `[formField]`.

## Switch

```ts
import { Switch } from "#ui/switch";
```

`Switch` is a 36×20 track with a 14px thumb on a native `<button>`, over Origami's [Switch](../origami-ui/switch/README.md): a click, Enter or Space toggles it. It has Checkbox's inputs, outputs, naming and notes, except `mixed` and `mixedChange`, since a switch has no mixed state, and the same looks: on, the track fills with the foreground color and the thumb slides to the end, following the text direction.

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

## OtpField

```ts
import { OtpField, OtpFieldInput } from "#ui/otp-field";
import { form, pattern, required } from "@angular/forms/signals";

readonly login = form(signal({ code: "" }), (p) => {
  required(p.code, { message: "Enter the code" });
  pattern(p.code, /^[0-9]{6}$/, { message: "Enter all 6 digits" });
});
```

`OtpField` is a one-time code or PIN over Origami's [OTP field](../origami-ui/otp-field/README.md), which owns the behavior: one native input holds the code, keeps only digits from typing, pasting and autofill, and maps a click to the cell under it. fold lays that input, an `OtpFieldInput`, transparently over a row of 40px cells, 8px apart, one per digit, and draws the caret, the selection and the focus on them:

<!-- prettier-ignore -->
```html
<div foldField #code="foldField">
  <label foldFieldLabel>Verification code</label>
  <div
    foldOtpField
    #otp="foldOtpField"
    [formField]="login.code"
    (valueChange)="otp.state.complete() && verify($event)"
  >
    <input foldOtpFieldInput />
  </div>
  <p foldFieldDescription>The 6-digit code we sent you</p>
  @if (code.state.errorsShown()) {
    <p foldFieldError>{{ code.state.errors()[0]?.message }}</p>
  }
</div>

<div foldOtpField [(value)]="pin" mask length="4" class="[--otp-field-cell-size:3rem]">
  <input foldOtpFieldInput aria-label="PIN" autocomplete="current-password" />
</div>
```

- `OtpField`: the row of cells. It takes `value` (two-way, a string of digits, `""` when empty), `length` (default 6), `mask` (a PIN: a dot in each filled cell, and the input a password field), `disabled`, `readonly` and `class`, and emits `valueChange` and `touch`; `[formField]` binds the value, `disabled` and `readonly`. Its template reference, `#otp="foldOtpField"` with your prefix, has `state`, with `value`, `complete`, `cells`, `focused`, `mask`, `disabled` and `readonly` signals. Its `focus()` focuses the input, so Signal Forms' `focusBoundControl()` reaches it. `--otp-field-cell-size` (default `2.5rem`) sets the cells' size.
- `OtpFieldInput`: the native input, invisible over the cells. It takes focus and is what a screen reader reads; the cells are hidden from assistive technology. Inside a Field it's the Field's control; outside one, give it an `aria-label`. Origami reads its `id` once, as a static attribute: write `id="…"` or let the Field generate one, not `[id]`. Its invisible text is 16px, where Origami's recipe has 1px, because iOS Safari zooms the page on focus into an input whose text is smaller; keep it at 16px or more if you edit your copy. It takes `class`.

A cell has the `surface` fill, an `input` border and its digit at 18px, semibold, with tabular figures. While the input has focus, the row has the 2px ring outline, and the cell where the next digit goes has a ring border, plus a thin caret bar while it's empty; a full code with the caret at its end has only the ring. A click on a filled cell selects its digit, with a foreground border over a neutral tint, and typing replaces it. Hovering the row darkens the borders. In an invalid field every other cell has a destructive border: the caret cell keeps its ring and a selected cell its foreground border, so the place you type stays visible. Readonly cells are dashed and unfilled, and still show the caret and the selection; a disabled row is at 50%.

- **Completion.** There's no completion event: read `state.complete()` in `valueChange`, as above. It fires for every edit that changes the code, typed, pasted or autofilled, but not for a value your app writes, such as from an on-screen keypad: check that one yourself, with `/^[0-9]{6}$/.test(code)`. See Origami's [Reacting to a complete code](../origami-ui/otp-field/README.md#reacting-to-a-complete-code).
- **Validation.** Exact validation is `required` plus `pattern`, as above. A value your app writes is kept as written, so `minLength(6)` alone lets `1234567` through. Say how many digits in a FieldDescription: the input has no `maxlength`.
- **PINs.** On a masked PIN, write `autocomplete="current-password"` where you ask for it and `new-password` where you set it. The default, `one-time-code`, lets phones offer a code from a message.
- **Width.** The row is as wide as its cells, `n × size + (n − 1) × 8px`, 280px for six default cells, and at most as wide as its container: in a narrower one, such as a Dialog on a 320px phone, the cells shrink equally and stay square, and the gaps stay 8px. `--otp-field-cell-size` is the size they take when there's room. Don't widen the row, such as with `w-full`: a click maps to equal slots of the input's width, so a row wider than its cells maps clicks to the wrong cells.
- **Autofill.** A code or PIN the browser autofills fills the cells, as typing does. Browsers paint their autofill highlight with `!important`, which would cover the cells, so `OtpFieldInput` hides its own paint while `:autofill` matches (`autofill:opacity-0`, plus a transparent `-webkit-text-fill-color`); keep both if you edit your copy.
- **Left to right.** The row has `dir="ltr"`, so a code's digits read left to right on a right-to-left page too.
- **Forced colors.** In forced-colors mode, such as Windows High Contrast, the cells are Canvas with CanvasText borders and digits, the caret cell's border and a selected cell are Highlight, and a disabled row's cells are GrayText. An invalid cell looks like a valid one: the Field's error text carries the state.

[Origami's README](../origami-ui/otp-field/README.md) describes the keys, paste, masking, hydration and the rest.

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

## Select

```ts
import { SelectParts } from "#ui/select";
import { form, required } from "@angular/forms/signals";

readonly contract = form(signal({ status: null as string | null }), (p) => {
  required(p.status, { message: "Choose a status" });
});
readonly statuses = [
  { value: "draft", label: "Draft", retired: false },
  { value: "active", label: "Active", retired: false },
  { value: "paused", label: "Paused", retired: true },
];
```

`Select` picks one value from a list, over Origami's [Select](../origami-ui/select/README.md), which owns the behavior: the keys, typeahead, pointer, positioning, Field membership and server rendering. `SelectTrigger` is Input's 32px box with the soft edge and a trailing chevron; `SelectContent` floats the `SelectOption`s 4px below it, in the [floating list](#floating-layers). In a Field, the Trigger is the Field's control; name the Field with a FieldLabel on a `<span>`:

<!-- prettier-ignore -->
```html
<div foldField #statusField="foldField">
  <span foldFieldLabel>Status</span>
  <div foldSelect [formField]="contract.status" #status="foldSelect">
    <button foldSelectTrigger>{{ status.state.selectedOption()?.label ?? "Choose a status" }}</button>
    <div foldSelectContent>
      @for (s of statuses; track s.value) {
        <div foldSelectOption [value]="s.value" [label]="s.label" [disabled]="s.retired">{{ s.label }}</div>
      }
    </div>
  </div>
  @if (statusField.state.errorsShown()) {
    <p foldFieldError>{{ statusField.state.errors()[0]?.message }}</p>
  }
</div>

<div foldSelect [(value)]="sort" #sortBy="foldSelect" class="w-44">
  <button foldSelectTrigger aria-label="Sort by">{{ sortBy.state.selectedOption()?.label ?? "Sort by" }}</button>
  <div foldSelectContent>
    <div foldSelectOption value="newest" label="Newest first">Newest first</div>
    <div foldSelectOption value="oldest" label="Oldest first">Oldest first</div>
  </div>
</div>
```

- `Select`: the root. It takes `value` (two-way), `open` (two-way), `disabled` and `class`, and emits `valueChange`, `openChange` and `touch`; `[formField]` binds the value and follows the field's `disabled()` and `readonly()` rules, but the readonly look keys on `aria-readonly`, which only a Field sets. Its template reference, `#status="foldSelect"` with your prefix, has `state`, with `value`, `open`, `disabled` and `selectedOption` signals. Its `focus()` focuses the Trigger, so Signal Forms' `focusBoundControl()` reaches it.
- `SelectTrigger`: a `<button>` showing what you write in it, truncated; the placeholder look follows Origami's `data-placeholder`. Write its text from `state.selectedOption()`, as above. It takes `id`, `disabled`, `focusableWhenDisabled` and `class`. Outside a Field, give it an `aria-label`.
- `SelectContent`: the list. It takes `id`, `side` (default `block-end`), `align` (default `start`), `gap` (default 4, in CSS pixels) and `class`.
- `SelectOption`: a 32px row with a check at its end while selected. It takes `value` (required), `label`, `disabled`, `id` and `class`. Its content can be any markup, such as a flag before the name.

Set `label` on every option: the Trigger's text and typeahead read it, and an option without one, or a value no option has, leaves the Trigger showing your fallback text in the foreground color instead of the placeholder look.

- **A label click does nothing.** Like RadioGroup, a Select's FieldLabel names it but doesn't focus it.
- **Readonly browses.** A readonly Select opens and moves its highlight, but choosing writes nothing and leaves the list open.
- **Long lists.** Every option is mounted while the list is closed; for hundreds of options, use a [Combobox](#combobox) and render only the matches.
- **One value.** There's no multiple selection; Origami's [`ogSelectMultiple`](../origami-ui/select/README.md) composes with fold's Trigger, Content and Option if you need it.
- **In a Dialog.** The list opens over the dialog in the top layer; the first Escape closes the list, the next one the dialog.

[Origami's README](../origami-ui/select/README.md) describes the keys, typeahead, hydration and the rest.

## Combobox

```ts
import { ComboboxParts } from "#ui/combobox";

readonly trip = form(signal({ planet: null as number | null }), (p) => {
  required(p.planet, { message: "Choose a planet" });
});
readonly planetQuery = signal("");
readonly planets = computed(() => {
  const query = this.planetQuery().trim().toLocaleLowerCase();
  const chosen = PLANETS.find((p) => p.id === this.trip.planet().value());

  // The chosen label is the query after a choice: show every planet then, not only that one.
  if (query === "" || chosen?.name.toLocaleLowerCase() === query) {
    return PLANETS;
  }

  return PLANETS.filter((p) => p.name.toLocaleLowerCase().startsWith(query));
});
```

`Combobox` is a text box that filters a list, over Origami's [Combobox](../origami-ui/combobox/README.md), which owns the behavior: typing writes `query` and opens the list, and you render only the options that match it. `ComboboxInput` has Input's look and is the Field's control, so name it with a FieldLabel on a `<label>`. An optional `ComboboxTrigger` chevron sits over the input's end and opens the whole list:

<!-- prettier-ignore -->
```html
<div foldField #planetField="foldField">
  <label foldFieldLabel>Planet</label>
  <div foldCombobox [formField]="trip.planet" [(query)]="planetQuery">
    <input foldComboboxInput placeholder="Search planets" />
    <button foldComboboxTrigger aria-label="All planets"></button>
    <div foldComboboxContent>
      @for (p of planets(); track p.id) {
        <div foldComboboxOption [value]="p.id" [label]="p.name" [disabled]="p.dwarf">{{ p.name }}</div>
      } @empty {
        <p foldComboboxEmpty>No planet matches “{{ planetQuery() }}”.</p>
      }
    </div>
  </div>
  @if (planetField.state.errorsShown()) {
    <p foldFieldError>{{ planetField.state.errors()[0]?.message }}</p>
  }
</div>
```

A server search without a Trigger, with two-line rows:

<!-- prettier-ignore -->
```html
<div foldCombobox [(value)]="customerId" [(query)]="customerQuery">
  <input foldComboboxInput aria-label="Customer" placeholder="Name, member number or email" />
  <div foldComboboxContent>
    @for (c of customers.value() ?? []; track c.id) {
      <div foldComboboxOption [value]="c.id" [label]="c.name">
        <span class="block">{{ c.name }}</span>
        <span class="block text-label font-normal text-muted-foreground">{{ c.email }}</span>
      </div>
    } @empty {
      <p foldComboboxEmpty>{{ customers.isLoading() ? "Searching…" : "No customers found." }}</p>
    }
  </div>
</div>
```

- `Combobox`: the root. It takes `value` (two-way), `query` (two-way), `open` (two-way), `disabled` and `class`, and emits `valueChange`, `queryChange`, `openChange` and `touch`; `[formField]` binds the value and follows the field's `disabled()` and `readonly()` rules, which make the input natively disabled or readonly. Its template reference, `#planet="foldCombobox"` with your prefix, has `state`, with `value`, `query`, `open` and `disabled` signals. Its `focus()` focuses the input.
- `ComboboxInput`: the text box and the list's anchor. It takes `id` and `class`.
- `ComboboxTrigger`: a 32px chevron button over the input's end, out of the Tab order; a click leaves focus in the input. Write it directly after the input, inside the root, so the input makes room for it, and give it an `aria-label`. It takes `id` and `class`.
- `ComboboxContent`, `ComboboxOption`: as Select's. The list stays open with no options.
- `ComboboxEmpty`: a muted row lined up with the options' text, for no matches or a pending search. It takes `class`.

Choosing an option puts its `label` in the input. Closing without a choice puts the last chosen label back, and only emptying the input clears the value.

- **Writing the value.** Writing `value` from outside doesn't change the text: write `query` too, such as the chosen record's name on an edit page, and after a form `reset()`.
- **Filter by more than the query.** Filtering by `query` alone shows only the chosen option when the Trigger reopens the list; show everything while the query is the chosen label, as above.
- **The empty row isn't announced.** Screen-reader users hear nothing when a search empties the list.
- **A label click focuses the input**, unlike Select.

[Origami's README](../origami-ui/combobox/README.md) describes the keys, typing, IME, hydration and the rest.

## Tabs

```ts
import { TabsParts } from "#ui/tabs";

readonly view = signal<string | null>("all");
```

`Tabs` switches between panels, over Origami's [Tabs](../origami-ui/tabs/README.md), which owns the behavior: selection, the arrow keys, roving focus and server rendering. `TabsList` is a row of text tabs, 36px tall and 20px apart on a 1px baseline; the selected `TabsTrigger` has `foreground` 600 text, a 2px underline and the green status-light dot, and the others muted 500 text. Each `TabsPanel` shows while its Trigger is selected:

<!-- prettier-ignore -->
```html
<section foldTabs [(value)]="view" #tabs="foldTabs">
  <div foldTabsList aria-label="Contract lists">
    <button foldTabsTrigger value="all">All contracts</button>
    <button foldTabsTrigger value="drafts">
      Drafts <span class="text-label font-normal text-muted-foreground tabular-nums">3</span>
    </button>
    <button foldTabsTrigger value="archived" [disabled]="!archiveReady()">
      <svg lucideArchive aria-hidden="true"></svg> Archived
    </button>
  </div>
  <div foldTabsPanel value="all">…</div>
  <div foldTabsPanel value="drafts">…</div>
  <div foldTabsPanel value="archived">
    @if (tabs.state.value() === "archived") {
      <app-archive />
    }
  </div>
</section>

<section foldTabs orientation="vertical" value="profile">…</section>
```

- `Tabs`: the root. It takes `value` (two-way), `disabled`, `orientation` (`horizontal` by default, or `vertical`), `activation` (`automatic` by default: an arrow key selects; `manual`: Enter or Space does) and `class`, and emits `valueChange`. Its template reference, `#tabs="foldTabs"` with your prefix, has `state`, with `value`, `disabled`, `orientation` and `activation` signals.
- `TabsList`: the row, or the column when vertical. Name it with `aria-label` or `aria-labelledby`. It takes `class`.
- `TabsTrigger`: a `<button>` tab. It takes `value` (required), `id`, `disabled`, `focusableWhenDisabled` and `class`. Its content can be any markup, such as a count or a 16px icon before the label.
- `TabsPanel`: the content for the Trigger with the same `value`. It takes `value` (required), `id` and `class`.

The value is yours: a tab with no matching value, or a `null` value, leaves nothing selected. The dot, the underline and the weight all follow Origami's `aria-selected`.

- **Vertical.** The List becomes a column beside the Panels, with its baseline on its inline end, and the selected tab's bar sits on it. Vertical tabs keep the dot's space on every row, so the labels line up and selecting one moves nothing; horizontal tabs show the dot only on the selected tab, so the label that loses it slides 14px.
- **Few, short tabs.** The List doesn't scroll or wrap, so a long one overflows a narrow container. Use a Select, or vertical Tabs, for many.
- **Heavy panels.** Every Panel is rendered while hidden; gate expensive content on `state.value()`, as above.
- **Panel focus.** A Panel is a Tab stop with the focus ring, for reading or scrolling it from the keyboard. When it starts with a focusable element, give it `tabindex="-1"`.
- **Layout on a Panel.** fold sets no `display` on a Panel, so a `class="grid"` of yours is still hidden while another tab is selected.
- **Not navigation.** For links between pages, use a `<nav>` of links with `aria-current="page"`, not Tabs.

[Origami's README](../origami-ui/tabs/README.md) describes the keys, activation, disabled tabs and hydration.

## Tooltip

```ts
import { Button } from "#ui/button";
import { TooltipParts } from "#ui/tooltip";

readonly dirty = signal(false);
```

`Tooltip` describes a control, over Origami's [Tooltip](../origami-ui/tooltip/README.md), which owns the behavior: hover with a delay, keyboard focus at once, Escape, the delay group across Tooltips and positioning. `TooltipContent` is an inverted chip, `foreground` with `background` text at 12px, 6px above its Trigger. Put `foldTooltipTrigger` on the button itself, next to its own fold directive:

<!-- prettier-ignore -->
```html
<span foldTooltip>
  <button foldButton size="icon" variant="ghost" aria-label="Copy link" foldTooltipTrigger (click)="copy()">
    <svg lucideLink aria-hidden="true"></svg>
  </button>
  <span foldTooltipContent>Copies the address of this page</span>
</span>
```

- `Tooltip`: the root, layout-transparent (`display: contents`), so the button stays the flex or grid item. It takes `open` (two-way), `disabled`, `openDelay` (600ms by default) and `class`, and emits `openChange`. Its template reference, `#tip="foldTooltip"`, has `state`, with `open` and `disabled` signals.
- `TooltipTrigger`: marks the element the Tooltip describes, adding its Content's id to the element's `aria-describedby`. It takes no inputs, sets no classes and has no `data-slot` of its own, so it keeps the button's.
- `TooltipContent`: the chip, up to 256px wide. It takes `id`, `side` (default `block-start`), `align` (default `center`), `gap` (default 6, in CSS pixels) and `class`.

It works on every fold button: a Button, a PopoverTrigger, a DialogTrigger, a SelectTrigger in a Field (whose description it joins in `aria-describedby`) or a TabsTrigger.

- **A description, not a name.** It's announced after the control's name. An icon button still needs its `aria-label`.
- **Touch never opens it.** Don't put anything essential only in a Tooltip.
- **Text only.** It can't hold links or buttons; use a [Popover](#popover) for those.
- **Layout on the root.** `display: contents` ignores layout classes such as `ms-auto` alone; add a display utility with them, like `class="inline-flex ms-auto"`.
- **One root per element.** Don't put `foldTooltip` and `foldPopover` on the same element; nest the wrappers instead.

An unavailable action can explain why with a Tooltip: a disabled button can't take focus or hover events, so make it `focusableWhenDisabled`. A focusable disabled button still dispatches `click`, from a pointer, Enter or Space, so its handler returns while the action is unavailable:

<!-- prettier-ignore -->
```html
<span foldTooltip>
  <button foldButton [disabled]="!dirty()" focusableWhenDisabled foldTooltipTrigger (click)="publish()">Publish</button>
  <span foldTooltipContent>
    @if (dirty()) { Publishes your changes } @else { Nothing to publish yet }
  </span>
</span>
```

```ts
protected publish(): void {
  if (!this.dirty()) {
    return;
  }

  this.changes.publish();
}
```

[Origami's README](../origami-ui/tooltip/README.md) describes opening and closing, the delay group, disabled controls and hydration.

## Popover

```ts
import { Button } from "#ui/button";
import { PopoverParts } from "#ui/popover";

readonly filtersOpen = signal(false);
```

`Popover` opens a non-modal panel from a button, over Origami's [Popover](../origami-ui/popover/README.md), which owns the behavior: opening and closing, positioning, Escape and outside clicks, focus restoration and server rendering. `PopoverTrigger` is styled like a Button and also anchors the panel; `PopoverContent` is a 288px [floating surface](#floating-layers) with 12px padding, 4px below the Trigger:

<!-- prettier-ignore -->
```html
<div foldPopover [(open)]="filtersOpen">
  <button foldPopoverTrigger>Filters <svg lucideChevronDown aria-hidden="true"></svg></button>
  <div foldPopoverContent aria-labelledby="filters-title" #filters="foldPopoverContent">
    <h2 id="filters-title" class="mb-2 text-title">Filters</h2>
    @if (filters.state.open()) {
      <div class="grid gap-3">
        …
        <button foldButton variant="primary" (click)="apply(); filtersOpen.set(false)">Apply</button>
      </div>
    }
  </div>
</div>
```

- `Popover`: the root, layout-transparent (`display: contents`). It takes `open` (two-way), `disabled`, `dismissible` (`true` by default; `false` keeps it open on Escape and outside clicks) and `class`, and emits `openChange`. Its template reference has `state`, with `open`, `disabled` and `dismissible` signals.
- `PopoverTrigger`: a `<button>` that opens and closes it, secondary by default. It takes Button's `variant`, `size` and `class`, plus `id`, `disabled` and `focusableWhenDisabled`. It's also the panel's anchor; there's no separate Anchor part. It renders `aria-haspopup="dialog"`, matching Content's default role: if you give Content another popup role, such as `menu` or `listbox`, set the matching token on the Trigger, and for `group`, `region` or no role, set `aria-haspopup="false"`.
- `PopoverContent`: the panel, `role="dialog"` by default. It takes `id`, `side` (default `block-end`), `align` (default `start`), `gap` (default 4, in CSS pixels) and `class`. Its template reference, `#filters="foldPopoverContent"`, has `state`, with an `open` signal that stays `true` through the closing animation.

Name the panel with `aria-labelledby` or `aria-label`, and author it right after its Trigger, so Tab moves from the Trigger into it. Escape and an outside click close it; Escape returns focus to the Trigger. There's no close part: close it from your own button by setting `open` to `false`.

- **Gate heavy content** on the Content's `state.open()`, as above; the panel's own markup is always rendered.
- **Layout inside.** fold sets no `display` on Content, which must keep the browser's closed `display: none`; lay out an inner element, like the `grid` above.
- **Not a focus trap.** It's non-modal: Tab leaves it for the next element on the page, and focus can move anywhere while it's open.
- **Tooltips inside it** show once it's open and hide when it finishes closing, staying visible through its closing animation.
- **Keyboard and scrolling.** Content scrolls when it's taller than the room left below or above the Trigger. Text-only Content that can scroll needs `tabindex="0"`, so the keyboard can reach and scroll it in every browser (Safari skips it otherwise). Interactive Content needs nothing; Firefox adds one Tab stop on the panel while it scrolls, which `tabindex="-1"` removes. Whenever the panel takes keyboard focus, it shows the focus ring.
- **In a Dialog.** It opens over the dialog in the top layer; the first Escape closes the Popover, the next one the dialog.
- **One button primitive per element.** Don't add `foldButton` to a PopoverTrigger; it already has the Button look.

[Origami's README](../origami-ui/popover/README.md) describes positioning, dismissal, nesting and hydration.

## Menu

```ts
import { RouterLink } from "@angular/router";
import { MenuParts } from "#ui/menu";
import { LucideEllipsis, LucidePencil, LucideTrash } from "@lucide/angular";
```

`Menu` is a list of actions that opens from a button, such as a table row's `⋯`, over Origami's [Menu](../origami-ui/menu/README.md), which owns the behavior: opening and closing, focus, the arrows and typeahead, checkable state, submenus, positioning and server rendering. `MenuTrigger` is styled like a Button; `MenuContent` is a [floating surface](#floating-layers) at least 192px wide, 4px below the Trigger, with 32px rows:

<!-- prettier-ignore -->
```html
<div foldMenu>
  <button foldMenuTrigger variant="ghost" size="icon" [attr.aria-label]="'Actions for ' + todo.title">
    <svg lucideEllipsis aria-hidden="true"></svg>
  </button>
  <div foldMenuContent align="end">
    <a foldMenuLink [routerLink]="['/todos', todo.id]">
      <svg lucidePencil aria-hidden="true"></svg> Edit <span foldMenuShortcut>⌘E</span>
    </a>
    <div foldMenuSeparator></div>
    <button foldMenuItem variant="destructive" (select)="delete(todo)">
      <svg lucideTrash aria-hidden="true"></svg> Delete
    </button>
  </div>
</div>
```

Checkbox and radio items, groups and submenus go in the same Content:

<!-- prettier-ignore -->
```html
<div foldMenu>
  <button foldMenuTrigger>View <svg lucideChevronDown aria-hidden="true"></svg></button>
  <div foldMenuContent align="end">
    <div foldMenuGroup>
      <div foldMenuGroupLabel>Show</div>
      <button foldMenuCheckboxItem [(checked)]="showCompleted">Completed tasks</button>
    </div>
    <div foldMenuSeparator></div>
    <div foldMenuRadioGroup [(value)]="density">
      <div foldMenuGroupLabel>Density</div>
      <button foldMenuRadioItem value="compact">Compact</button>
      <button foldMenuRadioItem value="comfortable">Comfortable</button>
    </div>
    <div foldMenuSeparator></div>
    <div foldMenuSub>
      <button foldMenuSubTrigger>Move to</button>
      <div foldMenuContent>
        <button foldMenuItem (select)="move('backlog')">Backlog</button>
        <button foldMenuItem (select)="move('done')">Done</button>
      </div>
    </div>
    <button foldMenuItem disabled>Archive project</button>
  </div>
</div>
```

Every part takes `class`:

- `Menu`: the root, layout-transparent (`display: contents`). It takes `open` (two-way) and `disabled`, and emits `openChange`. Its template reference, `#menu="foldMenu"`, has `state`, Origami's readonly observation of the menu.
- `MenuTrigger`: a `<button>` that opens and closes it, secondary by default. It takes Button's `variant`, `size` and `class`, plus `id`, `disabled` and `focusableWhenDisabled`. Give an icon-only Trigger an `aria-label`: its name is also the menu's.
- `MenuContent`: the panel, `role="menu"`. It takes `id`, `side` (default `block-end`, or `inline-end` inside a MenuSub), `align` (default `start`) and `gap` (default 4, in CSS pixels). Its template reference, `#view="foldMenuContent"`, has `state`, with an `open` signal that stays `true` through the closing animation.
- `MenuItem`: a `<button>` row that runs an action. It takes `disabled`, `label` (what typeahead reads, else its text) and `variant` (`default` or `destructive`), and emits `select` once the menu has closed and focused its Trigger.
- `MenuLink`: an `<a>` row that navigates, with your `href` or `routerLink`. It takes `label` and emits `select`.
- `MenuCheckboxItem`: a `<button>` row with a check at its end while it's checked. It takes `checked` (two-way), `disabled` and `label`, and emits `checkedChange` and `select`.
- `MenuRadioGroup`: the choice its MenuRadioItems share. It takes `value` (two-way, `null` for none).
- `MenuRadioItem`: a `<button>` row with a dot at its end while it's the group's `value`. It takes `value` (required), `disabled` and `label`, and emits `select`.
- `MenuGroup`: a group of rows, named by its MenuGroupLabels.
- `MenuGroupLabel`: a group's muted caption, never focused. It takes `id`.
- `MenuSeparator`: a 1px rule across the panel.
- `MenuSub`: a submenu's root, layout-transparent, inside a MenuContent: a MenuSubTrigger and its own MenuContent. It takes `open` (two-way) and `disabled`, and emits `openChange`; its template reference, `#move="foldMenuSub"`, has `state`.
- `MenuSubTrigger`: the `<button>` row that opens the submenu, with a chevron at its end. It takes `id`, `disabled` and `label`.
- `MenuShortcut`: a row's muted trailing shortcut text, fold's own part. It takes nothing else.

Listen to `select`, not `click`: it runs for a click, Enter or Space. A click or Space on a checkbox or radio item keeps the menu open, so several can change in a row; Enter changes it and closes the menu.

- **Real focus is the highlight.** The arrows, typeahead and the mouse move real focus between the rows, and the focused row gets the 8% foreground fill, disabled rows included: they're reachable, but don't activate. Keyboard focus adds the 2px focus ring.
- **Icons are projected `<svg>`s.** A row's direct `<svg>` children are 16px and follow its text color; put a leading icon first, with `aria-hidden="true"`.
- **`variant="destructive"`** colors the text and icon orange, never the highlight, which stays the neutral fill.
- **MenuShortcut is display-only.** It binds no key, and screen readers don't hear it (`aria-hidden`). When you bind the key yourself, add `aria-keyshortcuts` to the row.
- **Submenus open beside their trigger**, 4px from it, on the inline end, flipping to the other side when that has no room. Set `side` on a submenu's Content like any Content's.
- **Layout on the root.** Menu and MenuSub are `display: contents`, so their classes don't lay anything out; style the Trigger and Content.
- **One button primitive per element.** Don't add `foldButton` to a MenuTrigger; it already has the Button look.
- **Forms don't belong in a menu.** Menu rows are actions and options; for inputs, use a [Popover](#popover).

[Origami's README](../origami-ui/menu/README.md) describes the [keys](../origami-ui/menu/README.md#keyboard) and typeahead, [removing the row a menu belongs to](../origami-ui/menu/README.md#removing-the-row-a-menu-belongs-to), and [server rendering and hydration](../origami-ui/menu/README.md#server-rendering-and-hydration).

## Toast

```ts
import { ToastRegion, Toasts } from "#ui/toast";
```

`Toast` shows short notifications your code raises from anywhere, such as "Invoice saved" after a request, over Origami's [Toast](../origami-ui/toast/README.md), which owns the behavior: the records, timers and pausing, the limit, focus when a toast closes, the live region and server rendering. `Toasts` is your app's toaster; `ToastRegion` shows its toasts as a deck in the bottom-end corner, 20px from the viewport's edges and at most 384px wide. Put the region once, in your root component:

```ts
@Component({
  selector: "app-root",
  imports: [RouterOutlet, ToastRegion],
  template: `<router-outlet />
    <div foldToastRegion></div>`,
})
export class App {}
```

Then inject `Toasts` anywhere, such as a component, an effect or an HTTP interceptor, and add a toast:

```ts
readonly toasts = inject(Toasts);

this.toasts.add({ title: `Deleted "${todo.title}"`, kind: "success" });

// A toast someone must act on stays until it's closed. Reload runs, then the toast closes.
this.toasts.add(
  {
    title: "A new version is available",
    description: "Reload to get the latest changes.",
    kind: "info",
    action: { label: "Reload", run: () => document.location.reload() },
  },
  { duration: Infinity },
);
```

- `Toasts`: the toaster, provided in root. `add(data, { duration })` shows a toast and returns its id; `close(id)` closes it. `duration` is in milliseconds, or `Infinity` for a toast that stays until it's closed; without it, the region's applies.
- `ToastData`: what a toast shows: a `title`, an optional `description`, an optional `kind` (`success`, `info`, `warning` or `error`), which picks a 16px icon tinted green, muted, amber or orange, and an optional `action`, `{ label, run }`, a small button that runs `run()` and then closes the toast. Every toast has a Close button.
- `ToastRegion`: an attribute on your `<div>`. It takes `label` (the region's name, default `"Notifications"`), `closeLabel` (every Close button's name, default `"Close"`), `duration` (default 5000, in milliseconds), `limit` (the most open toasts, default 3; one more closes the oldest) and `class`.

The newest toast is in front, and older ones peek 8px above it at the one-line height, their content hidden. Hovering the deck, or focus inside it, fans it out into a column with the newest at the bottom, so the front toast's buttons stay under the pointer. A column taller than the viewport, less the region's 20px insets, scrolls inside it with no scrollbar: it opens at the newest toast, and Tab scrolls each control into view. An action's label wraps rather than widening its toast. Toasts enter and leave with the [floating layers'](#floating-layers) motion.

- **Once, in the root component.** The region must be in the server's HTML before any toast, so screen readers announce them, and a second region for the same toaster throws.
- **Don't provide `Toasts` again**, such as in a component's `providers`: that makes a second toaster no region shows.
- **Name it with `label`, not `aria-label`.** The live region is a `<section>` inside your `<div>`, so `aria-label` on the `<div>` names the wrong element.
- **Bottom placements only.** `class="start-5 end-auto"` moves it to the bottom-start corner. The peeks and the fan-out grow upward, so a top placement needs an edit to the copied `toast-region.ts`.
- **Every toast is polite**, errors included: a screen reader reads it after its current speech.
- **Write titles that state the outcome**, such as "Couldn't save the invoice", not "Error". The kind icon is decorative (`aria-hidden`), so the title is what screen readers hear.
- **Hover pauses the timer**, and so does focus inside the region; each toast continues with the time it had left. A toast that appears under a resting pointer waits until the pointer moves. See Origami's [timers and pausing](../origami-ui/toast/README.md#timers-and-pausing). Use `{ duration: Infinity }` for a toast someone must act on: auto-dismissal is acceptable under WCAG 2.2.1 only when the information is also available elsewhere.
- **Modal dialogs hold new toasts** until the last one closes, so add the toast and close the dialog in the same handler; see Origami's [modal dialogs](../origami-ui/toast/README.md#modal-dialogs).
- **It paints under floating layers.** The region isn't in the top layer, so open Popovers, Menus, Selects, Tooltips and Dialogs paint above it.
- **The collapsed height is the one-line height**, 58px: 12px padding, the 32px Close, 12px padding and the 1px borders. If you change the card's padding or the Close's size, change `--toast-collapsed` on the region to match, and keep the 8px peek inside the card's top padding, so a back card's controls never sit under a peek.
- **Back cards stay readable by screen readers.** Their content is transparent, not hidden. Keyboard focus in any card opens the deck at once; hover opens it with a short fan-out.

[Origami's README](../origami-ui/toast/README.md) describes [closing and removal](../origami-ui/toast/README.md#closing-and-removal), [focus](../origami-ui/toast/README.md#focus) and [modal dialogs](../origami-ui/toast/README.md#modal-dialogs).

## ScrollArea

```ts
import { ScrollArea } from "#ui/scroll-area";
```

`ScrollArea` is a scrolling box over Origami's [ScrollArea](../origami-ui/scroll-area/README.md), which owns the behavior: native scrolling with the browser's scrollbars hidden, the thumbs' size and position, dragging, wheel and track presses over them, when they show, and hydration. fold renders the viewport, the content and a scrollbar per axis in its template, and projects your content into it. The scrollbars are thin rounded thumbs over the box's edge that fade in on hover, scroll or drag:

<!-- prettier-ignore -->
```html
<!-- Both axes, bounded by a sized parent: a wide table. -->
<section class="h-80 rounded-surface border border-border">
  <div foldScrollArea orientation="both" aria-labelledby="addresses-title" class="size-full rounded-[inherit]" #area="foldScrollArea">
    <table>…</table>
  </div>
</section>
<button foldButton (click)="area.viewport().scrollTo({ top: 0 })">Back to top</button>

<!-- Vertical (the default), bounded by its own max height: grows until 240px, then scrolls.
     Padding and gaps go on a wrapper of your own inside, not on the root. -->
<div foldScrollArea aria-label="Delivery notes" class="max-h-60">
  <ul class="grid gap-2 p-3">…</ul>
</div>

<!-- Between a header and a footer in a fixed-height panel. -->
<aside class="flex h-80 flex-col">
  <header class="h-12 shrink-0">…</header>
  <div foldScrollArea aria-label="Filters" class="grow">…</div>
  <footer class="h-12 shrink-0">…</footer>
</aside>

<!-- A changing name binds the input, not the attribute. -->
<div foldScrollArea [aria-label]="panelName()" class="h-60">…</div>
```

`ScrollArea` takes `orientation` (`vertical` by default, `horizontal` or `both`), `aria-label`, `aria-labelledby` and `class`. Its template reference, `#area="foldScrollArea"`, has `viewport()`, the scrolling `HTMLElement`, and `state`, with `overflowX`, `overflowY` and `active` signals.

- **Size it.** Give the root a definite height (`h-*`, or `size-full` of a sized parent, with `min-h-0` in flex and grid parents), a `max-h-*` (it grows with its content up to the cap, then scrolls), or `grow` in a flex column. Without one, it grows with its content instead of scrolling. Between fixed bands in a flex column, give the bands `shrink-0`, as above, or long content shrinks them.
- **Lay out inside.** The root is a flex column fold relies on, and the scrollbars sit on its edge. Put padding, `gap`, grid or flex on an element of your own inside it. On the root, `grid` stops it scrolling, padding moves the content away from the scrollbar, and `gap` does nothing.
- **Naming.** `aria-label` and `aria-labelledby` name the viewport, the focusable scroller, which is then a `region`. Bind a changing name as `[aria-label]`, not `[attr.aria-label]`, which names the root instead. Unnamed, it's a focusable scroller without the region role.
- **The viewport.** `area.viewport()` is the native scroller, for `scrollTo()`, `scrollTop` and listeners. Call it from events and effects: during the first render it throws, since the view doesn't exist yet. It's a Tab stop, so the keyboard can scroll text and tables in every browser; when its content is all controls, set `tabindex="-1"` on the viewport in your copy of `scroll-area.ts` to remove the extra stop.
- **CDK overlays.** Origami doesn't register the viewport with the CDK. If a CDK overlay anchored inside it must follow its scrolling, add `cdkScrollable` (from `@angular/cdk/scrolling`) to the viewport in your copy. fold's own floating layers don't need it.
- **Orientation.** `vertical` wraps text to the box's width; `horizontal` and `both` let wide content scroll sideways. Changing it mounts or removes only the affected scrollbar.
- **Visibility** is Origami's: the scrollbars show on hover, scroll, drag and keyboard or script scrolling, and hide 600ms after the last of those, then fade out over 120ms. Under reduced motion they don't fade. In forced-colors mode the thumb is `CanvasText` on a `Canvas` rail. Before hydration the viewport scrolls natively and no thumbs are drawn; they appear once measured.

[Origami's README](../origami-ui/scroll-area/README.md) describes dragging, wheels over the scrollbars, geometry and hydration.

## Avatar

```ts
import { AvatarParts } from "#ui/avatar";
```

`Avatar` is an image of a person or an entity with a fallback, over Origami's [Avatar](../origami-ui/avatar/README.md), which tracks the image's status and hides whichever of the two shouldn't show. fold stacks them in one box: a 24, 32 or 40px circle, or a rounded square for entities, with a 1px inset ring, and grey initials or an icon until the photo paints. Write the fallback first and the image after it, so the image paints over it:

<!-- prettier-ignore -->
```html
<!-- A person, named on the root: a 32px circle. -->
<span foldAvatar role="img" [attr.aria-label]="user().name">
  <span foldAvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
  <img foldAvatarImage [src]="user().photoUrl" alt="" />
</span>

<!-- An entity tile: a 40px rounded square, decorative inside a named button, with an icon fallback. -->
<button foldButton variant="ghost" aria-label="Account">
  <span foldAvatar shape="square" size="lg">
    <span foldAvatarFallback aria-hidden="true"><svg lucideStore></svg></span>
    <img foldAvatarImage [src]="store().logoUrl" alt="" />
  </span>
</button>
```

- `Avatar`: the root. It takes `shape` (`circle` by default, or `square`), `size` (`sm` 24px, `md` 32px by default, `lg` 40px) and `class`. Its template reference, `#avatar="foldAvatar"`, has `state`, with a `status` signal: `idle` (no source), `loading`, `loaded` or `error`. A square's corners step down with its size: 6, 8 and 10px.
- `AvatarImage`: a native `<img>`. It takes `src` (`null`, `undefined` or `""` mean no image) and `class`; `alt` and every other attribute are yours.
- `AvatarFallback`: an HTML element, usually a `<span>`, holding your text or icon, 12px at `sm` and `md` and 13px at `lg`. Put an icon inside it, never the directive on an `<svg>`. It takes `class`.

Name it one of three ways, as [Origami's Naming](../origami-ui/avatar/README.md#naming) describes: the person's name as `alt` and as the fallback text; `role="img"` and `aria-label` on the root with both parts decorative, as above; or decorative (`alt=""` and an `aria-hidden` fallback) inside a control that names itself.

- **The loading delay.** While an image loads, the fallback stays transparent for 600ms, so a fast photo doesn't flash the initials first; without a source or after an error it shows at once. It's opacity only, so its text stays in the accessibility tree. The clock is CSS, so it also runs before hydration. To show the fallback at once, write `class="animate-none!"` on it (see [Class merging](#class-merging-and-slots)).
- **Bigger.** Size it with a class and give it a text size: `class="size-32 text-headline"`, with `border border-input` for a ring. A class-sized square keeps its `size` step's radius (8px for `md`), so add the radius too: `shape="square" class="size-32 rounded-control"`.
- **A failing server-rendered photo** shows the browser's broken-image icon over the fallback until the avatar hydrates. Hydration writes the source again, and Chromium and Firefox retry it: the icon stays until that retry fails too, and then Origami hides the image. See Origami's [Server rendering and hydration](../origami-ui/avatar/README.md#server-rendering-and-hydration).
- **Keep the parts in one hydrate boundary.** An image in its own `@defer` block that hasn't hydrated leaves the avatar `idle`, with the fallback under the painted photo.

### Initials

fold ships no initials helper, because splitting names well depends on the locale and the script. Write the rule your product needs, such as:

```ts
@Component({
  selector: "app-user-avatar",
  imports: [AvatarParts],
  template: `
    <span foldAvatar role="img" [attr.aria-label]="user().name">
      <span foldAvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
      <img foldAvatarImage [src]="user().photoUrl" alt="" />
    </span>
  `,
})
export class UserAvatar {
  readonly user = input.required<{ name: string; photoUrl: string | null }>();

  /** "Theo Matzavinos" → "TM": the first letter of the first and the last word. */
  protected initials(name: string): string {
    const words = name.trim().split(/\s+/);
    let letters = words[0]?.[0] ?? "";

    if (words.length > 1) {
      letters += words.at(-1)?.[0] ?? "";
    }

    return letters.toLocaleUpperCase();
  }
}
```

`[0]` takes one UTF-16 code unit, which suits Latin, Greek and Cyrillic names; for other scripts or emoji, split with `Intl.Segmenter`.

### Changing the person

A new `src` keeps the previous photo's pixels until the new one has decoded. If a reused avatar must never show one person's photo for another, re-create it per person:

<!-- prettier-ignore -->
```html
@for (id of [user().id]; track id) {
  <span foldAvatar role="img" [attr.aria-label]="user().name">
    <span foldAvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
    <img foldAvatarImage [src]="user().photoUrl" alt="" />
  </span>
}
```

Replacing a still-loading source with another doesn't restart the 600ms window, since the status stays `loading`. [Origami's README](../origami-ui/avatar/README.md) describes the status, retries and hydration.

## Progress

```ts
import { Progress } from "#ui/progress";
```

`Progress` shows how much of a task is done, over Origami's [Progress](../origami-ui/progress/README.md), which owns the value, its range, the value text and the ARIA. fold draws a 2px neutral bar, an `input` track, as visible as a control's border, that fills with the foreground color, and sweeps a segment across it while the progress is unknown:

<!-- prettier-ignore -->
```html
<div foldProgress [value]="sent()" [max]="total()" aria-labelledby="upload-name"></div>
<div foldProgress aria-label="Loading reservations"></div> <!-- unknown progress -->
<div foldProgress value="3" max="3" aria-label="Import"></div> <!-- complete -->
<div foldProgress [value]="620" [max]="1000" aria-label="Campaign" class="h-6"></div> <!-- thicker -->
```

`Progress` takes `value` (`null` or unset means unknown), `max` (100 by default), `valueText` and `class`; make it thicker with a height class. Its template reference, `#bar="foldProgress"`, has `state`, with `value`, `percent`, `complete` and `valueText` signals.

**Name it.** ARIA requires a progress bar to have a name, and neither fold nor Origami gives one or warns without it. Write `aria-label` or `aria-labelledby` on the bar itself, statically or bound with `[attr.aria-label]`: the bar is the `progressbar`.

### Dialog steps

A step bar between a [Dialog](#dialog)'s header and body, flush to its edges, with no change to the Dialog:

<!-- prettier-ignore -->
```html
<div foldDialog>
  <button foldDialogTrigger>New deposit</button>
  <dialog foldDialogContent class="gap-0">
    <div foldDialogHeader class="pb-5">
      <h2 foldDialogTitle>New deposit</h2>
      <p foldDialogDescription>Step 2 of 3 · Review details</p>
    </div>
    <div foldProgress value="2" max="3" aria-label="Deposit steps" class="-mx-5 w-auto shrink-0 rounded-none"></div>
    <div foldDialogBody class="my-0 py-5">…</div>
    <div foldDialogFooter>…</div>
  </dialog>
</div>
```

- `gap-0` on the Content removes the 20px gaps that would otherwise sit around the bar; `pb-5` on the Header and `py-5` on the Body put that space back inside them.
- `-mx-5 w-auto` stretches the bar across the Content's 20px padding to its border, and `rounded-none` squares its ends there.
- `shrink-0` keeps it 2px when the dialog runs out of height and its Body scrolls.
- `my-0` cancels the Body's own negative margins, which make room for focus rings, so it starts right under the bar.

### Page loader

An unknown-progress bar across the top of the page while it loads:

<!-- prettier-ignore -->
```html
@if (loading()) {
  <div foldProgress aria-label="Loading page" class="fixed inset-x-0 top-0 z-50 h-1 rounded-none"></div>
}
```

Tune the `z-50` to your shell: a sticky header with a higher one covers the bar.

### Visible text

The bar renders no text. Show its value text beside it through the template reference, hidden from assistive technology, which already reads the bar's own value text:

<!-- prettier-ignore -->
```html
<div class="flex items-center gap-3">
  <div foldProgress #bar="foldProgress" [value]="sent()" [max]="total()" aria-label="Campaign" class="h-6"></div>
  <span aria-hidden="true" class="tabular-nums">{{ bar.state.valueText() }}</span>
</div>
```

- **Complete is neutral**: a full foreground bar, since a finished dialog step isn't a success. Style the end through `data-complete`, such as `class="data-complete:[&>*]:bg-success"`.
- **Unknown progress** sweeps a 40% segment across the bar every 1.2s; under reduced motion it's a still, full, half-opacity bar. To stop the sweep deliberately, write `class="[&>[data-slot=progress-fill]]:animate-none!"` on the bar (see [Class merging](#class-merging-and-slots)); it then looks like a still segment, so do it only when something else says the work is ongoing.
- **Value changes** jump; the fill doesn't animate between values.
- **Forced colors.** In forced-colors mode the track is `GrayText` and the fill `CanvasText`.
- **Values** clamp to `[0, max]`, and a `max` of 0 makes the bar unknown, so show your own "nothing to do" state for a count that can be 0; see [Origami's values table](../origami-ui/progress/README.md#values).

## Floating layers

Select, Combobox, Popover and Menu share one look from `popup`, and Tooltip shares its motion: a folder of class lists with no Angular code, which your own panels can use too:

- `popupClasses`: a floating surface: 12px radius, the surface fill, a 1px border, 4px padding, the popover shadow, and the entrance and exit animations. Width and padding beyond that are yours.
- `popupMotionClasses`: the entrance and exit animations alone, for a floating layer with a look of its own, like Tooltip's chip. `popupClasses` includes them.
- `popupListClasses`: a list anchored to its trigger: at least as wide as it, at most the viewport's width less 16px, and at most 20rem tall or the room left less 8px, scrolling inside itself.
- `optionClasses`: a 32px option row with a 6px radius, an 8% foreground tint while highlighted, a check (its direct `<svg>` child) shown while selected, and 50% opacity when disabled.
- `menuItemClasses`: a 32px menu row with a 6px radius, the 8% foreground fill on real focus (`:focus`, which the mouse moves too), the 2px focus ring on keyboard focus, and 50% opacity when disabled.

```ts
import { cn } from "#ui/cn";
import { popupClasses } from "#ui/popup";

protected readonly classes = computed(() => cn(popupClasses, "w-72 p-3", this.class()));
```

- **Motion.** The list, panel or chip fades in and scales from 96% over 120ms once Origami has placed it, and reverses when it closes, from its center whichever side it opens on. Under reduced motion it doesn't animate, and it's hidden when Angular renders the close.
- **Out of the Tab order.** Select's and Combobox's Content have `tabindex="-1"`: in Chromium and Firefox a scrolling list is otherwise a Tab stop, and Tab from the open list lands on it instead of the next control. If you compose `popupListClasses` over Origami's Content yourself, add it too. Popover Content has none, because its panel can hold text the keyboard needs to reach; see its [keyboard and scrolling](#popover) note.
- **Forced colors.** In forced-colors mode, such as Windows High Contrast, the highlighted option or focused menu row paints `Highlight` with `HighlightText`, and a disabled one `GrayText`; a destructive menu row keeps the system text color, and a menu separator is `GrayText`. Text you put in an option or a menu row follows its row's system color, whatever its own color class. A descendant's own background, border or fill keeps its color, so give it `forced-colors:` classes. To keep a deliberate system color on a descendant's text, write `forced-colors:text-[Mark]!`: the `!` is required, because the shared rule has the same specificity and comes later.

## Limitations

- Re-running `add` can't tell untouched files from edited ones, because the CLI reformats them with your Prettier; see `--existing`.
- The dialog scrim is set on `::backdrop`, which needs to inherit custom properties. Chromium, Firefox and WebKit do.
- `tailwind-variants` adds about 13 kB gzipped to your bundle.
- `ng add` adds `imports` at the top of your `package.json`.
- Nx workspaces are untested.
- No range, multi-thumb or vertical Slider, and no ticks or marks; no press-and-hold or wheel stepping in NumberField.
- No grouped or separated cells, letters or reveal toggle in OtpField.
- No multiple Select, clear button, option groups or separators as parts (plain `role="group"` and `role="separator"` markup works), item-aligned positioning or virtualization. Near the viewport's edge, Origami flips a list's alignment or slides it along the edge to keep it in view; it overflows only along its main axis, when neither side of its trigger has room.
- No scrolling or wrapping Tabs List, sliding underline or link tabs.
- No Tooltip shorthand attribute, close delay or arrows; no PopoverAnchor, PopoverClose, title or description parts, and no open look on PopoverTrigger. Near the viewport's edge, Origami flips a Tooltip's or Popover's alignment or slides it along the edge to keep it in view; it overflows only along its main axis, when neither side of its Trigger has room.
- No context menu, menubar, mixed checkbox item or disabled MenuLink (use a disabled MenuItem), and no keep-open on Enter for checkbox and radio items: that's Origami's contract. In a narrow viewport, a submenu that fits on neither side of its parent, such as a 200px submenu at 390px, overflows the viewport's edge.
- No replacing or deduplicating a toast by id, hotkey, promise or loading toasts, swipe, or placement other than the bottom corners. Outside Chromium, the deck's heights snap instead of animating (no `interpolate-size`; the offsets and scale still animate), and when the front toast closes, the next one snaps to its full height once the exit ends.
- No ScrollArea hide-delay input, corner, scroll shadows or `cdkScrollable`; its root's layout is fold's. No Avatar groups, "+N" or initials helper; a class-sized avatar doesn't pick its radius from its size. No Progress label or value part, buffer, segments, vertical bar or animated value; the unknown sweep runs left to right in right-to-left text. Avatar's delay and Progress's sweep override only with an important utility.
- A Tooltip inside a Popover stays visible through the Popover's closing animation, about 120ms, and hides when the Popover does.
- In Firefox's forced-colors mode, focus rings are `CanvasText`, the text color, rather than Chromium's `Highlight`: fold leaves the ring's forced color to the browser, as on every other fold part.

## Developing this package

`components/` holds the component sources the schematics copy, authored with the placeholder prefix `fold__` (`fold__Button`), which `add` replaces with yours. `schematics/` holds `ng-add` and `add`.

```sh
pnpm --filter @loozo/fold-ui test           # typecheck schematics and components, build, schematic tests
pnpm --filter @loozo/fold-ui test:consumer  # ng new → ng add → add → production build → Chromium smoke
```

`test:consumer` needs network access for the app's `npm install`, and runs its build and browser steps under Origami's machine-wide gate lock.
