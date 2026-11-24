# @loozo/fold-ui

Styled Angular components for back-office apps, built on [Origami](../origami-ui/README.md)'s headless primitives and themed with Tailwind CSS v4. fold doesn't ship a component library you import: its schematics copy each component's source into your app, where you own and edit it.

Each fold part is a directive that adds classes, usually composing an Origami directive; layout-only parts, such as AlertDialog's Header and Footer, compose none. A few parts render markup of their own, such as Dialog's close button and Select's chevron; a Calendar renders its whole header and grid. Origami keeps the behavior, accessibility and server rendering; fold adds the look: neutral greys, one green for the primary action, orange only for destructive actions, compact 28, 32 and 36px controls, and dark and light themes.

**Status:** experimental. MIT license. It currently has Button (with ButtonLink), AlertDialog, Dialog, Sheet, Field with Input, Textarea, Checkbox, Switch, RadioGroup, NumberField, OtpField, Slider, FileField, Select and Combobox, Tabs, Tooltip and Popover, Menu, Toast, ScrollArea, Avatar, Progress and Meter, Page, Table, Badge and Empty, Calendar, and DateField, TimeField, DateTimeField, and DatePicker with its multiple, range, month and date-time pickers. There's no loading state, Nx support or way to update a theme you already added.

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
ng generate @loozo/fold-ui:add --names file-field
ng generate @loozo/fold-ui:add --names checkbox switch radio-group
ng generate @loozo/fold-ui:add --names number-field slider
ng generate @loozo/fold-ui:add --names otp-field
ng generate @loozo/fold-ui:add --names select combobox
ng generate @loozo/fold-ui:add --names search-bar
ng generate @loozo/fold-ui:add --names tabs tooltip popover
ng generate @loozo/fold-ui:add --names accordion collapsible
ng generate @loozo/fold-ui:add --names menu
ng generate @loozo/fold-ui:add --names toggle toggle-group toolbar
ng generate @loozo/fold-ui:add --names toast
ng generate @loozo/fold-ui:add --names scroll-area avatar progress meter
ng generate @loozo/fold-ui:add --names page table badge empty
ng generate @loozo/fold-ui:add --names calendar
ng generate @loozo/fold-ui:add --names date-field date-picker
```

NumberField, Slider, FileField, Combobox, OtpField, Menu, Toast, ScrollArea, Avatar, Progress and Meter import `@loozo/origami-ui/number-field`, `/slider`, `/file-field`, `/combobox`, `/otp-field`, `/menu`, `/toast`, `/scroll-area`, `/avatar`, `/progress` and `/meter`, which no published Origami has yet (npm has 0.0.4). Select, Popover, Dialog and Sheet scroll in a ScrollArea, so adding one adds `scroll-area` and needs `/scroll-area` too. So does Table, whose TableFrame scrolls in one. Tabs, Tooltip, Accordion and Collapsible import only what 0.0.4 has. An app set up with an older Origami needs its `@loozo/origami-ui` raised first, since `add` doesn't change dependencies.

Toggle and ToggleGroup import only what 0.0.4 has. Toolbar imports `OrigamiToolbarMenuTrigger` from `@loozo/origami-ui/toolbar`, which no published Origami has yet, so `add toolbar` doesn't build on 0.0.4 even without a Menu; its popup triggers sit in fold's Popover and Menu, which need `/scroll-area` too. All three are tested with this repository's Origami, built from source, not with 0.0.4.

SearchBar imports `@loozo/origami-ui/query-field`, which no published Origami has yet, so `add search-bar` needs the first Origami release that has it. Its input has Input's look and its list `popup`'s, scrolling in a ScrollArea, so adding `search-bar` adds `input`, `popup` and `scroll-area`, and needs `/scroll-area` too. It's tested with this repository's Origami, built from source.

Calendar forwards Origami's `selectedDescription`, which no published Origami has yet: on 0.0.4 the build fails with `NG2017: Directive OrigamiCalendar does not have an input with a public name of selectedDescription.`, once per Calendar root.

DateField, TimeField, DateTimeField and DatePicker import `@loozo/origami-ui/date-field` and `/date-picker`, which 0.0.4 has. The date fields build on 0.0.4; DatePicker hosts a Calendar, so it fails the same way as Calendar there. DateTimePicker also imports `OrigamiDateTimePicker`, which no published Origami has: on 0.0.4 the `date-picker` folder fails with a missing `OrigamiDateTimePicker` export besides the Calendars' `NG2017`, and errors that follow from both. So the `date-picker` folder needs the first Origami release after 0.0.4. On 0.0.4, digit segments have no `aria-valuetext` and the Calendar's live heading has a different politeness; this README describes the next Origami release.

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

`add` also copies the components a component imports: AlertDialog's, Dialog's and Sheet's buttons are styled by Button's `ButtonStyle`, so adding `alert-dialog`, `dialog` or `sheet` adds `button` too; Textarea shares Input's look, so adding `textarea` adds `input`; Select, Combobox, Tooltip and Popover share the floating layers' look and motion from `popup`, so adding any of them adds `popup`, Combobox's input is Input's look, so adding `combobox` adds `input` too, and PopoverTrigger is styled by `ButtonStyle`, so adding `popover` adds `button`; MenuTrigger is styled by `ButtonStyle` and the panel and rows come from `popup`, so adding `menu` adds `button` and `popup`; Toast's buttons use `Button` and its cards `popup`, so adding `toast` adds `button` and `popup`; Calendar's buttons use `buttonVariants` and fold's Button, so adding `calendar` adds `button`; DatePicker's popup hosts the Calendar on `popup`'s surface round DateFieldInput, so adding `date-picker` adds `date-field`, `calendar` (and so `button`) and `popup`; FileFieldButton is styled by Button's `buttonVariants`, so adding `file-field` adds `button`; Toggle is a ghost Button, so adding `toggle` adds `button`; ToggleGroup's items share Toggle's on look, so adding `toggle-group` adds `toggle` (and so `button`); Toolbar's controls use both, so adding `toolbar` adds `toggle-group`, `toggle` and `button`, but not `radio-group`, `popover`, `menu` or `tooltip`; Accordion's and Collapsible's panels share their motion from `disclosure`, so adding either adds `disclosure`, and CollapsibleTrigger is styled by `ButtonStyle`, so adding `collapsible` adds `button`; and every component merges its classes with `cn`, so the first `add` adds `cn`. Components import each other as `../button`.

The files are yours from then on. `add` writes them with your prefix and the Angular CLI formats them with your workspace's Prettier, so `add` can't tell a file you edited from one you didn't. When a named component's folder already exists, `--existing` decides:

- `skip` (default): keep your folder and warn.
- `overwrite`: write fold's files into the folder, replacing those with the same names. Files you added stay.
- `error`: fail before writing anything.

A component that's only a dependency is always kept when its folder exists. To replace it, name it.

## Theming

`theme.css` holds sixteen color tokens, `--radius`, the soft edge shadow `--edge` and the dialog scrim `--scrim`, then maps them to Tailwind with `@theme inline`. Dark is the default theme, on `:root` and `.dark`; a `.light` class swaps every token, for the whole page or for one subtree:

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

**Existing themes.** A `theme.css` copied before the `--info` token existed lacks it, so an info [Badge](#badge) looks neutral, and `text-info` and `bg-info` don't exist, until you add its three lines: `--info: #82b4ec;` under `:root, .dark`, `--info: #1f5f9e;` under `.light`, and `--color-info: var(--info);` in `@theme inline`. Neither `ng add` nor `add` changes a theme you already have.

## Class merging and slots

Every part except the AlertDialog, Dialog, Sheet and Collapsible roots and TooltipTrigger takes a `class` input that's merged over fold's classes, so a conflicting utility of yours wins:

```html
<button foldButton class="px-6">Wider</button>
```

One exception: AvatarFallback's loading delay and Progress's unknown sweep are component styles, which an ordinary `animate-*` utility doesn't override. Use Tailwind's important form, `animate-none!`, as their sections show, or edit the motion rule in your copy. ScrollArea's `class` is on its root, whose layout is fold's; see [ScrollArea](#scrollarea).

An AccordionPanel's or CollapsiblePanel's `class` styles its content box, inside the clip that animates, never the Panel itself, so padding can't jump the closed height. Give it a static `class`, or bind a whole string with `[class]`. For a class that comes and goes, bind the whole string or put it on your own element inside the Panel:

```html
<div foldAccordionPanel [class]="wide() ? 'px-16' : 'px-8'">
  <div class="grid gap-4" [class.opacity-60]="saving()">…</div>
</div>
```

`[class.x]`, `[ngClass]` and other directives or scripts that write a Panel's class aren't supported: after the first render they write the Panel itself, which can pad the closed box or stop its motion. To style the Panel's own box, target it from a parent, such as `[&_[data-slot=accordion-panel]]:…`.

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

Every part except TooltipTrigger, which shares its button's, sets a `data-slot` attribute, such as `data-slot="button"` or `data-slot="alert-dialog-content"`, to target it from CSS or from a parent's classes, like `[&_[data-slot=button]]:w-full`. The decorative markup inside Checkbox, Switch, RadioGroupItem and Slider has its own: `checkbox-indicator` (the check) and `checkbox-mixed-indicator` (the minus), `switch-thumb`, `radio-group-indicator`, and `slider-track`, `slider-rail` and `slider-fill`. NumberField's parts are `number-field`, `number-field-input`, `number-field-decrement`, `number-field-increment` and `number-field-adornment`; Slider's are `slider` and `slider-thumb`. FileField's are `file-field`, `file-field-input`, `file-field-button`, `file-field-drop-zone` (with `file-field-drop-zone-icon`) and `file-field-value` (with `file-field-value-icon`, `file-field-name`, `file-field-size` and `file-field-clear-slot` around `file-field-clear`). OtpField's are `otp-field` and `otp-field-input`, with `otp-field-cell` for each cell and, inside a cell, `otp-field-dot` (a masked digit) and `otp-field-caret` (the bar). Select's are `select`, `select-trigger`, `select-content` and `select-option`, with `select-value` and `select-icon` inside the Trigger and `select-option-text` and `select-option-indicator` inside an option; Combobox's are `combobox`, `combobox-input`, `combobox-trigger`, `combobox-content`, `combobox-option` (with `combobox-option-text` and `combobox-option-indicator`) and `combobox-empty`. Tabs' are `tabs`, `tabs-list`, `tabs-trigger` (with `tabs-indicator`, the dot) and `tabs-panel`; Tooltip's are `tooltip` and `tooltip-content`; Popover's are `popover`, `popover-trigger` and `popover-content`. Menu's are `menu`, `menu-trigger`, `menu-content`, `menu-item`, `menu-link`, `menu-checkbox-item` (with `menu-checkbox-item-indicator`), `menu-radio-group`, `menu-radio-item` (with `menu-radio-item-indicator`), `menu-group`, `menu-group-label`, `menu-separator`, `menu-sub`, `menu-sub-trigger` (with `menu-sub-trigger-icon`) and `menu-shortcut`. Toast's are `toast-region`, `toast-list`, `toast` (with `toast-icon`, `toast-title` and `toast-description`) and `toast-close`; a toast's action is a `button`. ScrollArea's are `scroll-area`, with `scroll-area-viewport`, `scroll-area-content`, one `scroll-area-scrollbar` per axis and its `scroll-area-thumb` in its template; Avatar's are `avatar`, `avatar-image` and `avatar-fallback`; Progress's are `progress`, with `progress-fill` inside. Meter's and MeterRing's root is `meter`, with `meter-fill` inside a Meter, and `meter-arc` and `meter-value` inside a MeterRing. The date fields' roots are `date-field` (DateField, TimeField and DateTimeField alike), with `date-field-input` (the box) holding `date-field-segments`, the scrolling row, with a `date-field-cell` per unit, each with its `date-field-segment`, and a `date-field-literal` per separator; DatePicker's are `date-picker` (every picker root: DatePicker, DatePickerMultiple, DatePickerRange, MonthPicker and DateTimePicker), `date-picker-trigger` (with `date-picker-value` and `date-picker-icon`), `date-picker-content` and `date-picker-footer`. Accordion's are `accordion` (both roots), `accordion-item`, `accordion-header`, `accordion-trigger` (with `accordion-label` around your content and `accordion-indicator`) and `accordion-panel`, with `accordion-panel-clip` and `accordion-panel-content` inside; Collapsible's are `collapsible`, `collapsible-trigger` and `collapsible-panel`, with `collapsible-panel-clip` and `collapsible-panel-content` inside. Select's, Combobox's, Menu's and Popover's Content, DialogBody and SheetBody render a ScrollArea inside, so its `scroll-area…` slots are there too: target their scroller as `[&_[data-slot=scroll-area-viewport]]`.

State is styled from the attributes Origami sets: a disabled button has `data-disabled`, so `data-disabled:` and `not-data-disabled:` variants key on it. A Field has `data-invalid`, `data-disabled` and `data-required` and its control `aria-invalid`, plus `aria-readonly` on a readonly Checkbox, Switch or RadioGroup; Input and Textarea also style native `:disabled` and `[readonly]`. A checked Checkbox, an on Switch and a selected RadioGroupItem have `data-checked`; a mixed Checkbox has `data-mixed` and no `data-checked`. A NumberField has no state attributes of its own: its box reads its input's `:disabled`, `[readonly]`, `[aria-invalid=true]` and `:focus-visible` through `:has()`, and a − or + button at a limit or while readonly has `data-disabled` without being natively disabled. An OtpField's cells have `data-filled`, `data-caret` and `data-selected`; like NumberField, the row reads its input's `:focus-visible`, `:disabled`, `[readonly]` and `[aria-invalid=true]` through `:has()`. A Slider has `data-disabled`, `data-dragging` and the `--og-slider-percent` custom property, and its thumb `aria-invalid` and `aria-readonly`. A FileFieldDropZone has `data-drag-over` while a file drag is over it, and a FileFieldButton and a FileFieldClear `data-disabled` while their field is disabled; both read their input's `:focus-visible`, `:disabled` and `[aria-invalid=true]` through `:has()`. A Select Trigger has `aria-expanded`, `aria-invalid`, `aria-readonly`, `data-disabled` and, while nothing is chosen, `data-placeholder`; a Combobox input styles native `:disabled` and `[readonly]` like Input. An option has `data-active` while highlighted, `data-selected` and `data-disabled`, and a list `data-entering` and `data-leaving` while it animates. A TabsTrigger has `aria-selected`, `data-disabled` and its root's `data-orientation`, and a TabsList `aria-orientation`; Tooltip and Popover Content have `data-entering` and `data-leaving`, and a PopoverTrigger `aria-expanded`. Menu rows style `:focus`, the real focus the mouse moves too; a checked checkbox or radio item has `data-checked`, a disabled row `data-disabled`, a destructive item `data-variant="destructive"` and an open MenuSubTrigger `aria-expanded`, and MenuContent has `data-side`, `data-entering` and `data-leaving`. A toast has `data-kind`, `data-entering` and `data-leaving`, is `inert` through its exit, and sets `--toast-index`, its place in the deck, 0 for the newest. A ScrollArea has `data-overflow-x` and `data-overflow-y` while its viewport overflows that way, and each scrollbar `data-orientation` and, while shown, `data-visible`. An Avatar has `data-status`: `idle`, `loading`, `loaded` or `error`. A Progress has `data-complete` or `data-indeterminate`, and the `--og-progress-percent` custom property while its value is known. A Meter and a MeterRing have the `--og-meter-percent` custom property; fold adds `data-region` (`optimum`, `suboptimum` or `worst`) when any of `low`, `high` or `optimum` is set. A date field's segments have `aria-invalid`, `aria-readonly`, `aria-disabled` and, while empty, `data-placeholder`; the box reads them, and the segments' `:focus`, through `:has()`. A DatePickerTrigger has `aria-expanded`, `aria-invalid` and `data-disabled`, and in the button shape fold adds `data-placeholder` while the value is empty (null, or no days) and `data-readonly` while the picker is readonly, each `""` or absent; DatePickerContent has `data-entering` and `data-leaving`. An AccordionItem and a Collapsible root have `data-expanded` and `data-disabled`, and their triggers `aria-expanded`, `aria-disabled` and `data-disabled` (also on Single's locked open trigger); an AccordionItem sets `--accordion-trigger-opacity`, `--accordion-trigger-cursor` and `--accordion-trigger-forced-text`, its trigger's disabled look, and resets them for nested items. A Panel has `data-expanded`, `data-entering`, `data-present` and `data-leaving`, and `hidden` (`until-found` or `""`) once closed. fold's Field adds `data-orientation`.

A Calendar root's slot is `calendar`, whichever of the four it is; inside it are `calendar-header` (with `calendar-previous`, `calendar-heading`, `calendar-view-switch` and `calendar-next`), `calendar-grid`, `calendar-weekday`, `calendar-cell` with `calendar-cell-label` (the chip) inside, and CalendarRange's `calendar-prompt`. A cell has Origami's `aria-selected`, `data-selected`, `data-today`, `data-outside`, `data-disabled`, `data-current`, `data-range-start`, `data-range-end`, `data-in-range` and `data-preview`; the grid has `aria-invalid`, `aria-readonly` and `aria-disabled`. fold adds two presence attributes from CalendarRange's `state.anchor()`: `data-anchor` on the pending first day's cell and `data-pending` on the grid while a first day is pending. They're `""` or absent, never `"false"`, so style with `[data-pending]` and `:not([data-pending])`. While the grid has `data-pending`, the committed range's band, end fills, rounding and forced-colors rail caps yield to the square preview.

Toggle's slot is `toggle`. ToggleGroup's are `toggle-group`, for both roots, and `toggle-group-item`, with `toggle-group-indicator` (the dot) inside. Toolbar's are `toolbar`, `toolbar-separator`, `toolbar-button`, `toolbar-toggle`, `toolbar-toggle-group` (for both groups), `toolbar-radio-group`, `toolbar-popover-trigger` and `toolbar-menu-trigger`; the items inside its groups keep `toggle-group-item` and `radio-group-item`. A Toggle, ToolbarToggle or ToggleGroupItem has Origami's `aria-pressed` and, while on, `data-pressed`, plus `data-disabled`; a ToggleGroup root has `data-orientation` and `data-disabled`, and fold adds `data-indicator` to a Single root with `indicator`. A Toolbar has `data-orientation` and `aria-orientation`; its separator has the perpendicular `aria-orientation`, and fold mirrors the Toolbar's `data-orientation` onto ToolbarRadioGroup, which Origami gives none.

Table's parts are `table-frame`, `table`, `table-row`, `table-column-header`, `table-sort-button` (with `table-sort-icon`, the arrow) and `table-cell`, and `table-pager`; TableFrame renders a ScrollArea, so its `scroll-area…` slots are there too. Badge's is `badge`. Page's are `page`, `page-header`, `page-title`, `page-description` and `page-actions`; Empty's are `empty`, `empty-title`, `empty-description` and `empty-actions`. A TableColumnHeader has `aria-sort` while sorted and `data-align`, its TableSortButton `data-sort` while its column is sorted, a TableCell `data-align`, and a Badge `data-tone`.

SearchBar's parts are `search-bar` and `search-bar-input`, with, in its template, `search-bar-icon`, `search-bar-marks` (the layer behind the input) holding `search-bar-marks-row` with a `search-bar-mark` per run of the query, `search-bar-content` (the list) with `search-bar-message` and a `search-bar-suggestion` per row (with `search-bar-suggestion-detail`), and the hidden `search-bar-errors`. A mark has `data-part` (`qualifier`, `value` or `text`), `data-qualified` on a qualified token's runs and `data-invalid` on an invalid token's; the layer has `data-composing` during an IME composition; a row has `data-active` while highlighted; and the input has `aria-invalid` while a token is invalid.

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
      <div foldDialogBody>
        <div class="grid gap-4">
          <div foldField>
            <label foldFieldLabel>Reference</label>
            <input foldInput [readOnly]="pending()" [formField]="f.reference" />
          </div>
          …
        </div>
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
- `DialogBody`: the part that scrolls when the dialog runs out of height, so the header and footer stay in place. It scrolls in a [ScrollArea](#scrollarea) with its scrollbar at the panel's edge: lay out its content in an element of your own inside it, as the examples do; its `class` sizes and places the Body itself. A control focused near its top or bottom scrolls fully into view, focus ring included; the Body's 16px scroll padding keeps it clear of the edge as far as the Body can scroll, so the distance left also depends on the content before or after the control and on the browser's focus scrolling. The dialog keeps the page behind it scroll-locked, including when you wheel over the scrollbar at either end. Its content wraps to its width; put a wide table or code block in a horizontal ScrollArea of its own, as Popover's wide content note shows. Without a Body, the whole dialog scrolls, close button and footer included.
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
        <div foldDialogBody><div class="grid gap-4 sm:grid-cols-2">…</div></div>
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
      <div foldSheetBody>
        <div class="grid gap-4">
          <div foldField>
            <label foldFieldLabel>Search</label>
            <input foldInput [formField]="f.search" />
          </div>
          …
        </div>
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
- `SheetBody`: the part that scrolls when the sheet runs out of height, so the header and footer stay in place. It scrolls in a [ScrollArea](#scrollarea) with its scrollbar at the panel's edge: lay out its content in an element of your own inside it, as the examples do; its `class` sizes and places the Body itself. A control focused near its top or bottom scrolls fully into view, focus ring included; the Body's 16px scroll padding keeps it clear of the edge as far as the Body can scroll, so the distance left also depends on the content before or after the control and on the browser's focus scrolling. The sheet keeps the page behind it scroll-locked, including when you wheel over the scrollbar at either end. Its content wraps to its width; put a wide table or code block in a horizontal ScrollArea of its own, as Popover's wide content note shows. Without a Body, the whole sheet scrolls, close button and footer included.
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
- `FieldLabel`: in body text at weight 600, or 400 in a horizontal Field. On a `<label>` it names the control: use a `<label>` for Input, Textarea, Checkbox, Switch, NumberField, OtpField and FileField, or they're left unnamed. On another element, such as a `<span>`, it names a group, such as a [RadioGroup](#radiogroup), or a [Slider](#slider), which Origami points `aria-labelledby` at; that label isn't clickable. It dims while the Field is disabled. It takes `id`.
- `FieldDescription`: a 12px muted hint. It takes `id`.
- `FieldError`: a 12px message in the destructive text color, after an alert icon hidden from assistive technology. It always shows while it's mounted, so put it under `@if (field.state.errorsShown())`; the text is yours. It takes `id`.

Origami's Field README describes the wiring, when errors show and the server rendering. Field wraps any control that joins an Origami Field, not only fold's.

Field's state needs Signal Forms' `[formField]` on the control. With reactive forms' `[formControl]`, `ngModel` or a bare native `disabled`, every state signal stays `false`: no error border, no `errorsShown` to gate errors on, and no dimmed label. Native `:disabled` and `[readonly]` still style the control.

A disabled Field also dims the labels of Fields nested inside it, and a horizontal Field sets theirs at weight 400.

NumberField and Slider go in a vertical Field: a NumberField under a `<label>`, a Slider under a `<span>`.

The label dims only from the Field's Signal Forms disabled state: a Checkbox disabled through `[disabled]` without `[formField]` dims itself, not its label.

An error that appears when focus leaves a field moves everything below it. If leaving was a press on the next control, that control moves down between the press and the release, and the click can miss it (seen in Firefox and WebKit with a date picker's trigger under a required one). Reserve the error's line, with a wrapper as tall as the error, such as `min-h-5`, holding the `@if`, or show errors after a submit.

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

## FileField

```ts
import { FileFieldParts } from "#ui/file-field";
import { LucideUpload } from "@lucide/angular";
import { form, required, validate } from "@angular/forms/signals";

const MB = 1024 * 1024;

readonly billing = form(signal({ invoice: null as File | null }), (p) => {
  required(p.invoice, { message: "Choose the invoice" });
  validate(p.invoice, ({ value }) =>
    (value()?.size ?? 0) > 25 * MB ? { kind: "fileTooLarge", message: "Up to 25 MB" } : undefined,
  );
});
```

`FileField` takes one file, over Origami's [File field](../origami-ui/file-field/README.md), which owns the behavior: the browser's own picker, drops, the value, Field membership and server rendering. It has two looks over the same hidden native `<input type="file">`: a `<label>` styled as a fold [Button](#button), or a dashed drop zone with an upload icon above your text. A `FileFieldValue` shows the chosen file's name and size, and a `FileFieldClear` inside it empties the field:

<!-- prettier-ignore -->
```html
<div foldField #invoice="foldField">
  <label foldFieldLabel>Invoice</label>
  <div foldFileField [formField]="billing.invoice">
    <label foldFileFieldButton>
      <svg lucideUpload></svg> Choose file
      <input foldFileFieldInput accept=".pdf,.jpg,.jpeg,.png" />
    </label>
    <p foldFileFieldValue>
      <button foldFileFieldClear aria-label="Remove the invoice"></button>
    </p>
  </div>
  <p foldFieldDescription>PDF, JPG or PNG, up to 25 MB</p>
  @if (invoice.state.errorsShown()) {
    <p foldFieldError>{{ invoice.state.errors()[0]?.message }}</p>
  }
</div>

<div foldField>
  <label foldFieldLabel>Attachment</label>
  <div foldFileField [formField]="attachment.file">
    <label foldFileFieldDropZone>
      <span><span class="font-semibold text-foreground">Choose a file</span> or drag it here</span>
      <input foldFileFieldInput />
    </label>
    <p foldFileFieldValue>
      <button foldFileFieldClear aria-label="Remove the attachment"></button>
    </p>
  </div>
</div>

<div foldFileField [(value)]="logo" #picker="foldFileField">
  <label foldFileFieldButton variant="ghost" size="sm">
    Upload logo <input foldFileFieldInput accept="image/*" />
  </label>
  <p foldFileFieldValue></p>
</div>
```

- `FileField`: the root, a wrapping row with a 12px gap, so a button look and its value share a line, and a full-width zone puts the value 8px under it. It takes `value` (two-way, `File | null`), `disabled` and `class`, and emits `valueChange` and `touch`; `[formField]` binds the value and `disabled`. Its template reference, `#picker="foldFileField"` with your prefix, has `state`, with `value` and `disabled` signals, for a preview of your own. Its `focus()` focuses the Input, so Signal Forms' `focusBoundControl()` reaches it.
- `FileFieldInput`: the native file input, visually hidden but still focusable, and the field's one control: it takes the Tab stop, opens the picker on Enter and Space, and is what assistive technology reads. Origami makes it `type="file"`; add `accept`. Origami reads its `id` once, as a static attribute: write `id="…"` or let the Field generate one, not `[id]`. It takes `class`.
- `FileFieldButton`: a `<label>` around the Input, with Button's `variant` (default `secondary`) and `size` (default `md`), and `class`. A click opens the picker. It doesn't take drops.
- `FileFieldDropZone`: a full-width `<label>` around the Input, with a 24px upload icon above your text. A click opens the picker, and a dropped file is chosen as a picked one is. It takes `class`.
- `FileFieldValue`: a file icon, the name and the size, or nothing while no file is chosen, with a slot after the size for a FileFieldClear, which ends the row 12px after it. It's at least 160px wide, so in a narrow row it wraps under a button look with its Clear rather than squeezing the name, and a FileField narrower than 160px overflows. A long name truncates before its extension, as in `statement-of-acc….pdf`, with the full name in its `title`; what follows the last dot counts as the extension only when it's up to 5 letters or digits, such as `.pdf` or `.docx`, so `notes.final version` and `page.webarchive` truncate as a whole. In a very narrow row a wide extension, such as `.WWWWW`, can take the whole name and leave no stem. Only Latin, Greek and Cyrillic names without direction marks are split, and they keep their order on a right-to-left page too; a name in another script, such as `تقرير-final.pdf`, is laid out by the browser in its own direction and truncates as a whole. Keep it inside the FileField, which it reads; it takes `class`.
- `FileFieldClear`: a 32px ghost × that empties the field through Origami's [Clear](../origami-ui/file-field/README.md#clear) and moves focus to the Input, so the same file can be chosen again. It's hidden while no file is chosen, so you write no `@if`, and disabled and dimmed to 50% while the field is disabled. fold gives it no name: name it with `aria-label`, as above. Write it inside the FileFieldValue, so it ends the value's row and stays beside the name when the row wraps, and never inside the button look or the zone, which are `<label>`s. Activating it doesn't touch the field, but a pick already did, so a required field shows its error as soon as it's emptied. Its negative vertical margins keep the value 8px under a zone. It takes `class`.

The looks follow the Input's state. Keyboard focus on it draws the green ring around the look you see, and turns the zone's border green too; a mouse click draws no ring. While the Field shows errors, the look's border is orange. A disabled field dims the look and the value to 50%, with no hover, no picker and no drops. While a file drag is over the zone, its border turns solid in the foreground color over an 8% foreground tint; green stays for focus. In forced-colors mode, such as Windows High Contrast, the looks take system colors, an invalid look looks like a valid one, as on other fold controls, so the FieldError carries the state, and the zone's drag-over border is `Highlight`.

The size is in 1024-based units up to GB, with at most one decimal, formatted in your app's `LOCALE_ID` with a no-break space before the unit: `0 B`, `999 B`, `1.5 KB`, `25 MB` and `1.3 GB`, or `1,5 KB` in Greek. Provide another `LOCALE_ID` on a component to format the sizes inside it.

- **Validation is yours.** Size, type and name rules are Signal Forms `validate()` rules over the `File`, as above; fold and Origami ship none. `accept` is only a hint to the picker: browsers don't apply it to drops or to the picker's "All files" choice, so check the type in the form and on the server. A pick or a drop touches the field, so its errors show at once. Give every rule a `message`.
- **Size text at limits.** The shown size is rounded, so a file 1 byte over 25 MB reads `25 MB` while your check rejects it. Name the limit in the error, as in "Up to 25 MB", not the file's size, and compare bytes, not the shown text.
- **Clearing.** A FileFieldClear empties the field. From code, write `null` through your model, `billing.invoice().value.set(null)`, or `reset({ invoice: null })`; a bare `reset()` keeps the file. Writing `null` also empties the native input, so the same file can be chosen again. If you empty the field from code while its FileFieldClear has focus, the Clear hides and focus falls to `<body>`: call the root's `focus()` to move it to the Input.
- **Rejecting a pick.** With `[formField]`, don't write the field back to `null` inside the pick's own `valueChange`: Angular Signal Forms 22.2.6 through 22.3.0 doesn't push that write to the picker, so the form holds `null` while the picker keeps the file. Write it after the next render instead; Origami's [Clearing and choosing again](../origami-ui/file-field/README.md#clearing-and-choosing-again) has the details.
- **Drops outside the zone.** A file dropped outside every zone, or before the zone hydrates, gets the browser's default, which may open the file in place of your page. To prevent that, add the one guard from Origami's [Drops](../origami-ui/file-field/README.md#drops) to your app shell.
- **The Field's label opens the picker.** A `<label foldFieldLabel>` names the Input with `for`, so a click on its text opens the picker too, and the Input's name joins both labels, as in "Invoice Choose file".
- **One look per field.** A FileField has one Input, so use one look in it. Don't put a FileFieldButton inside a FileFieldDropZone: both are `<label>`s, which can't nest.
- **No readonly.** A form's `readonly()` rule doesn't reach the field; use `disabled()`.

[Origami's README](../origami-ui/file-field/README.md) describes picks, drops, hydration and the rest.

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
- **Scrolling.** The list scrolls in a fold [ScrollArea](#scrollarea) whose viewport isn't a Tab stop. Its 4px padding is fold's: the scroller fills the list inside its border, with the options 4px in, so a `class` that changes the list's padding leaves the scroller misplaced. At the list's end, a wheel over its scrollbar can scroll the page behind it.

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
- `ComboboxContent`, `ComboboxOption`: as Select's. The list stays open with no options. It scrolls in a ScrollArea like Select's, and at its end a wheel over its scrollbar can scroll the page behind it.
- `ComboboxEmpty`: a muted row lined up with the options' text, for no matches or a pending search. It takes `class`.

Choosing an option puts its `label` in the input. Closing without a choice puts the last chosen label back, and only emptying the input clears the value.

- **Writing the value.** Writing `value` from outside doesn't change the text: write `query` too, such as the chosen record's name on an edit page, and after a form `reset()`.
- **Filter by more than the query.** Filtering by `query` alone shows only the chosen option when the Trigger reopens the list; show everything while the query is the chosen label, as above.
- **The empty row isn't announced.** Screen-reader users hear nothing when a search empties the list.
- **A label click focuses the input**, unlike Select.

[Origami's README](../origami-ui/combobox/README.md) describes the keys, typing, IME, hydration and the rest.

## SearchBar

```ts
import { SearchBar, SearchBarInput, type SearchBarAnalysis } from "#ui/search-bar";

readonly query = signal(this.route.search().q ?? "");
readonly caret = signal<number | null>(null);
// Your parser: query tokens, and suggestions for the token at the caret.
readonly analysis = computed((): SearchBarAnalysis => analyseReportQuery(this.query(), this.caret()));
```

`SearchBar` is a query input, such as `report status:submitted by:@me`, over Origami's [query field](../origami-ui/query-field/README.md), which owns the behavior: it applies your analysis to the text and caret it was computed for, opens and closes the list, and edits the query in place when a suggestion is picked, through the browser's own insertion, so Ctrl+Z undoes it. You parse the query; fold draws what you report behind the input's text, from Origami's state: a soft tint behind each qualifier and a fainter one behind its value, and a red wavy underline under an invalid token. The input keeps its native glyphs, caret, selection and input methods, with a search icon at its start. Typing opens a list under it with a row per suggestion, its label and a muted detail; while the caret is in an invalid token, its message sits above its fixes:

<!-- prettier-ignore -->
```html
<div foldSearchBar [(query)]="query" (caretChange)="caret.set($event)" [analysis]="analysis()" (search)="apply($event)">
  <input foldSearchBarInput aria-label="Search reports" placeholder="status:submitted by:@me" />
</div>

<!-- In a Field, the Label names the input and the Descriptions describe it. -->
<div foldField>
  <label foldFieldLabel>Search reports</label>
  <div foldSearchBar [(query)]="query" (caretChange)="caret.set($event)" [analysis]="analysis()" (search)="apply($event)">
    <input foldSearchBarInput />
  </div>
  <p foldFieldDescription>Filters such as status:submitted</p>
</div>
```

- `SearchBar`: the root, with the icon, the marks, the list and the hidden errors in its template. It takes `query` (two-way, the whole text, written on every edit), `analysis` (a `SearchBarAnalysis`, or `null` for no marks and no suggestions), `disabled` and `class`, and emits `queryChange`, `caretChange` (the caret in UTF-16 code units, `null` on blur and for a range selection) and `search` (the query, on Enter while no row is highlighted, except the one Enter right after a highlight you saw lapsed; see Searching). Its template reference, `#search="foldSearchBar"` with your prefix, has `state`, with `query`, `caret`, `tokens`, `segments`, `caretToken`, `invalid`, `suggestions`, `open`, `scrollLeft`, `composing` and `disabled` signals. Its `focus()` focuses the input.
- `SearchBarInput`: the text box, with Input's look, and the list's anchor. It takes `id` and `class`. Keep it `type="text"`, the default: Chromium clears a `type="search"` input on Escape, which closes the list.
- `SearchBarSuggestion`: Origami's suggestion, a range of the query and the `insert` that replaces it, plus the row's `label` and an optional `detail`. The label needn't be the insert: a Greek `κατάσταση` row can insert `status:`.

- **The analysis** is yours, stamped with the query and caret it was computed for: parse synchronously, so marks and `aria-invalid` follow every keystroke, and load only suggestions asynchronously. While the caret you hold is past the query's end, as just after you write a shorter query, publish `caret: null` before computing completions or starting a lookup. Origami's [The analysis](../origami-ui/query-field/README.md#the-analysis) describes the shapes, freshness and an async lookup with `resource()`.
- **Searching.** `query` follows every edit and `search` fires on Enter while no row is highlighted, so a page can search on Enter or, debounced, as you type. Two exceptions: when a highlight you saw lapses, because the caret moved or the rows changed under it, the next Enter does nothing, once; and Enter keeps its default, so the form's standard implicit submission still applies: if the form submits on Enter, wiring both its submit and `search` to the same action runs it twice. Origami's [The list](../origami-ui/query-field/README.md#the-list) has the key table and the lapse rules. To normalize edits, such as lower-casing them, see its [Editing and events](../origami-ui/query-field/README.md#editing-and-events).
- **Keys.** While there are suggestions, ArrowDown and ArrowUp open the list and move the highlight while focus stays in the input, and Alt+ArrowDown opens it with nothing highlighted; Enter applies the highlighted row and a click applies the row you press, each leaving the caret after the inserted text; Escape closes the list and keeps the text; Tab closes it and moves on. The list never opens on focus alone. [The list](../origami-ui/query-field/README.md#the-list) has the whole table.
- **Accessibility.** The input is a combobox and the highlighted row its `aria-activedescendant`. The icon and the marks are hidden from screen readers. While a token is invalid the input has `aria-invalid="true"`, and its description reads every token's error, from the hidden errors element; each fix is described by the message. A message without fixes isn't a listbox: the input stays `aria-expanded="false"`. Outside a Field, name the input with `aria-label`.
- **Marks line up** because the input and the layer share the root's metrics: `--search-bar-pad-start` (2rem, the icon's room), `--search-bar-pad-end` (0.625rem) and `--search-bar-border` (1px), and the root's font. Change them on the root through `class`, such as `class="[--search-bar-pad-start:2.25rem]"`, not the input's padding, border or font, or the marks drift from the text. During an IME composition the marks hide. In forced-colors mode a mark has no fill, since `Mark` behind the dark palette's white text would hide it: it gets a 1px `CanvasText` outline inside its box instead, solid on a qualifier and dotted on its value, and the underline is `CanvasText`. The input opts out of forced colors, so no text backplate covers the marks, and sets its own system colors, as Input has them.
- **Not included:** a clear button, chips, opening on focus, Tab completion, a loading row, Signal Forms binding (`[formField]`), right-to-left marks and multi-line queries.

[Origami's README](../origami-ui/query-field/README.md) describes picks and undo, input methods, descriptions in a Field, hydration and the rest.

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

## Accordion

```ts
import { AccordionParts } from "#ui/accordion";

readonly faq = signal<string | null>(null); // Single
readonly sections = signal<readonly string[]>(["applicant"]); // Multiple
```

`AccordionSingle` and `AccordionMultiple` stack sections that open and close, over Origami's [Accordion](../origami-ui/accordion/README.md), which owns the behavior: selection, the locks, the ARIA links, `hidden` and find-in-page reveal. The rows sit on the current ground, divided by 1px `border` lines. Each trigger is a full-width row, at least 38px tall, with 13px 600 `foreground` text and a 16px `muted-foreground` chevron at its inline end that turns while its panel is open. Panels grow and shrink in 180ms with a fade. You write each section's heading, with `AccordionHeader` on it, around the Trigger:

<!-- prettier-ignore -->
```html
<!-- An FAQ: one open at a time, and the open one closes again. -->
<div foldAccordionSingle [(value)]="faq" collapsible>
  <div foldAccordionItem value="cancel">
    <h3 foldAccordionHeader><button foldAccordionTrigger>How do I cancel a contract?</button></h3>
    <div foldAccordionPanel>Open the contract and choose End contract…</div>
  </div>
  <div foldAccordionItem value="legacy" disabled>…</div>
</div>

<!-- Settings: without collapsible, the open section stays open until another one opens. -->
<div foldAccordionSingle [(value)]="settings">…</div>

<!-- Mobile navigation: no heading, no chevron. -->
<div foldAccordionSingle collapsible>
  <div foldAccordionItem value="reports">
    <div foldAccordionHeader><button foldAccordionTrigger indicator="false">Reports</button></div>
    <div foldAccordionPanel><a href="/reports/monthly">Monthly</a></div>
  </div>
</div>
```

- `AccordionSingle`: at most one open item. It takes `value` (two-way, `string | null`), `disabled`, `collapsible` (the open item's trigger closes it) and `class`, and emits `valueChange`. Its template reference, `#accordion="foldAccordionSingle"` with your prefix, has `state`, with `itemValues` and `disabled` signals. `itemValues` follows page order as of the latest item added or removed: reordering the same items, such as sorting a keyed `@for`, doesn't update it.
- `AccordionMultiple`: items open independently. It takes `value` (two-way, `readonly string[]`, never mutated), `disabled` and `class`, and `state` as above.
- `AccordionItem`: one section. It takes `value`, `disabled`, `hiding` (`until-found` by default, or `hidden`) and `class`. `#item="foldAccordionItem"` has `state`, with `expanded` and `disabled` (the root's or its own) signals.
- `AccordionHeader`: put it on your heading element (`h2`, `h3`…), or on a `div` where there's no heading. It takes `class`.
- `AccordionTrigger`: a `<button>` row. It takes `id`, `focusableWhenDisabled`, `indicator` (`true` by default; `false` drops the chevron) and `class`. Its content is the label: text and other non-interactive phrasing content, such as a 16px icon before it or a count after it, never a link, button or input, which a `<button>` can't hold. Long labels wrap.
- `AccordionIndicator`: put it on an icon inside a Trigger to replace the chevron. It doesn't turn; it takes `class`.
- `AccordionPanel`: the section's content. It renders two `div`s inside itself and sets `display: grid`, so put it on a `div`, `section`, `article`, `aside`, `nav` or `dd`, never a `p`, list or table cell (the rule is the [Collapsible's Panel elements](#collapsible)). It takes `id` and `class`, which styles its content box (see [Class merging](#class-merging-and-slots)): 8px in from the row's sides and 12px below by default. `#panel="foldAccordionPanel"` has `state`, with an `open` signal that stays true until the closing motion ends.

The value is yours: a value with no item, or `null`, opens nothing, and removing an item doesn't remove its value.

- **Item values.** Give every item an explicit `value`. Without one, Origami generates it separately on the server and in the browser, so an item open from the start, a saved selection or hydration can't match it.
- **Headings.** fold renders no heading: put `AccordionHeader` on the level that fits the page, or a `div` in navigation, where a heading would clutter the outline. A trigger without a heading in a document section loses its place in the page's outline. Give a Panel `role="region"` yourself when a few large sections should be landmarks.
- **Single's lock.** Without `collapsible`, the open item's trigger can't close it: it has `aria-disabled="true"` and `data-disabled`, stays focusable and keeps full contrast, the ring and a default cursor, with no hover tint. It doesn't guarantee an open item: writing `null`, or removing the open section, leaves none open.
- **The indicator.** Project your own icon with `AccordionIndicator`, such as a plus that becomes a minus. Write both branches, `@if` and `@else`: a projected `@if` alone also removes the chevron while it's false.

  <!-- prettier-ignore -->
  ```html
  <div foldAccordionItem value="applicant" #item="foldAccordionItem">
    <h2 foldAccordionHeader>
      <button foldAccordionTrigger>
        Applicant
        @if (item.state.expanded()) {
          <svg lucideMinus foldAccordionIndicator></svg>
        } @else {
          <svg lucidePlus foldAccordionIndicator></svg>
        }
      </button>
    </h2>
    <div foldAccordionPanel class="px-8">…</div>
  </div>
  ```

- **Disabled.** A disabled root or item dims its triggers to 50% with a `not-allowed` cursor, natively disabled, or a Tab stop with `aria-disabled` under `focusableWhenDisabled`. The look comes from each trigger's own item, so an accordion nested in a disabled item's panel keeps its own.
- **Find in page.** A closed panel is `hidden="until-found"` by default, so the browser's find-in-page, a link to an `id` inside it and a text fragment (`#:~:text=`) open its item: the browser fires `beforematch`, Origami updates your value, then the browser removes `hidden` and scrolls. Only text that's rendered can be found, so deferred content isn't. Disabled items and `hiding="hidden"` use plain `hidden`. The server HTML is plain `hidden` until the page hydrates, so a fragment followed before then can miss closed text (Firefox does when a page opens at one), and browsers without `hidden="until-found"` (Safari before 26.2, Firefox before 139) use plain `hidden`.
- **VoiceOver in Safari 26.2 to 26.x.** When script removes `hidden="until-found"`, VoiceOver can't navigate to the revealed content ([WebKit bug 310623](https://bugs.webkit.org/show_bug.cgi?id=310623)). Origami removes it on every ordinary open: a trigger click or key, or your app writing the value. A find-in-page or fragment reveal, where the browser removes it, isn't affected. Safari 27.0 fixes it. If you support those Safari versions, give sections whose content readers must reach `hiding="hidden"`: they then open from plain `hidden`, which VoiceOver handles, but find-in-page and fragment links can't open them.
- **Where a match ends up.** When the browser reveals a match, its panel opens at once, without the motion, and in an `AccordionSingle` the item that reveal closes closes at once too. The panels taking part in the reveal don't move after the browser scrolls, so the match lands where the browser scrolled to; a change that isn't part of the reveal, such as a panel your app is closing around the match, can still move or hide it. Once the reveal settles, clicks, keys and your writes animate under the usual motion rules (see Motion). Safari's Find, and Firefox's from 139 to 147, can open the item without scrolling to the match at all, with or without reduced motion.
- **Deferred content.** Panels keep their content rendered while closed. To render it only while open, gate it on the Panel's `state.open()`, as Tabs does with its value; it then isn't findable while closed and loses its own state, such as unsaved inputs in a child component, each time it closes. Keep form values in your model, as Signal Forms does, so closing a section keeps them.

  ```html
  <div foldAccordionPanel #panel="foldAccordionPanel">
    @if (panel.state.open()) {
    <app-applicant-fields [form]="payment" />
    }
  </div>
  ```

- **Motion.** A panel's height eases between 0 and its content's height, with a fade, in 180ms; a second click turns it from where it is. Under `prefers-reduced-motion: reduce` it opens and closes at once, and the chevron still turns, without a transition. A panel that mounts open in the browser, such as an accordion in a dialog or on a page you navigate to, slides in once; panels open in the server HTML don't. In browsers without `@starting-style` (Safari before 17.5, Firefox before 129), a panel opening from plain `hidden` snaps open; closing still animates.
- **Tab during motion.** Tab can reach an opening panel's controls before its motion ends, and its edges can cut their focus ring until then; the ring shows in full once it settles. If you Tab into a panel while it's closing, focus returns to the page when it hides; the next Tab continues after the panel.
- **Forms.** The browser's constraint validation can't reach a control in a closed section: it reports the error and doesn't submit, with the section still closed. Use `novalidate`, validate in your app, open the sections with errors, then focus the first erroneous control after the next render, when the section's `hidden` is gone and deferred content is rendered:

  ```ts
  readonly payment = form(signal({ name: "", delivery: null as string | null, email: "" }), (path) => {
    required(path.name, { message: "Enter your name" });
    required(path.delivery, { message: "Choose how we send invoices" });
    required(path.email, { message: "Enter a billing email" });
  });
  // Which section holds which field, in page order.
  readonly #sectionFields = [
    { section: "applicant", fields: [this.payment.name] },
    { section: "billing", fields: [this.payment.delivery, this.payment.email] },
  ];
  readonly #injector = inject(Injector);

  protected async save(): Promise<void> {
    await submit(this.payment, {
      action: async () => this.api.save(this.payment().value()),
      onInvalid: () => this.#showErrors(),
    });
  }

  #showErrors(): void {
    const invalid: { section: string; field: FieldTree<unknown> }[] = [];

    for (const { section, fields } of this.#sectionFields) {
      for (const field of fields) {
        if (field().invalid()) {
          invalid.push({ section, field });
        }
      }
    }

    if (invalid.length === 0) {
      return;
    }

    this.sections.set([...new Set([...this.sections(), ...invalid.map((error) => error.section)])]);
    // focusBoundControl() reaches fold controls through their focus(): a RadioGroup's tab stop.
    afterNextRender(() => invalid[0].field().focusBoundControl(), { injector: this.#injector });
  }
  ```

  <!-- prettier-ignore -->
  ```html
  <form novalidate (submit)="$event.preventDefault(); save()">
    <div foldAccordionMultiple [(value)]="sections">
      …
      <div foldAccordionItem value="billing">
        <h2 foldAccordionHeader><button foldAccordionTrigger>Billing contact</button></h2>
        <div foldAccordionPanel class="px-8">
          <div foldField #delivery="foldField">
            <span foldFieldLabel>Send invoices by</span>
            <div foldRadioGroup [formField]="payment.delivery">…</div>
            @if (delivery.state.errorsShown()) {
              <p foldFieldError>{{ delivery.state.errors()[0]?.message }}</p>
            }
          </div>
          <div foldField>…<input foldInput type="email" [formField]="payment.email" /></div>
        </div>
      </div>
    </div>
    <button foldButton type="submit">Save settings</button>
  </form>
  ```

  Without Signal Forms, give the control you'll focus its own reference, such as `<div foldRadioGroup #deliveryGroup …>` (the Field's `#delivery` is the Field, not the group), query it with a TypeScript-private field (Angular rejects `#private` queries) and call its `focus()` the same way: `private readonly deliveryGroup = viewChild("deliveryGroup", { read: RadioGroup });`, then `this.deliveryGroup()?.focus()` after the next render. The control gets focus while its section is still opening, so it can be partly cut off until the motion ends.

- **No arrow keys.** Tab moves between the triggers; there's no arrow, Home or End navigation (Origami's contract).

[Origami's README](../origami-ui/accordion/README.md) describes selection, the locks and the replaceable options.

## Collapsible

```ts
import { CollapsibleParts } from "#ui/collapsible";

readonly reportsOpen = signal(false);
```

`Collapsible` shows and hides one panel from one trigger, over Origami's [Collapsible](../origami-ui/collapsible/README.md). fold adds the trigger's Button look and the panel's motion, the Accordion's: no row, icon or turning chevron of its own, so you pick the look. The root is any element and has no classes of its own:

<!-- prettier-ignore -->
```html
<!-- A sidebar group: a ghost trigger with a chevron that turns, and the list inside the Panel. -->
<li foldCollapsible [(expanded)]="reportsOpen">
  <button foldCollapsibleTrigger variant="ghost" class="w-full justify-start">
    <svg lucideReceipt aria-hidden="true"></svg> Reports
    <svg
      lucideChevronDown
      aria-hidden="true"
      class="ms-auto transition-transform duration-180 ease-out motion-reduce:transition-none [[aria-expanded=true]>&]:rotate-180"
    ></svg>
  </button>
  <div foldCollapsiblePanel class="ps-6">
    <ul>
      <li><a href="/reports/monthly">Monthly</a></li>
      <li><a href="/reports/tax">Tax summaries</a></li>
    </ul>
  </div>
</li>

<!-- "Show more" after the rows that always show. -->
<div foldCollapsible #more="foldCollapsible">
  <div foldCollapsiblePanel>…more rows…</div>
  <button foldCollapsibleTrigger variant="link" size="sm">
    {{ more.state.expanded() ? "Show fewer" : "Show 12 more" }}
  </button>
</div>

<!-- A table row's details: the cell keeps its span, the Panel is a div inside it. -->
<tbody foldCollapsible>
  <tr>
    <td><button foldCollapsibleTrigger variant="ghost" size="sm">INV-0412</button></td>
    …
  </tr>
  <tr><td colspan="4" class="p-0"><div foldCollapsiblePanel class="px-2">…details…</div></td></tr>
</tbody>
```

- `Collapsible`: the root. It takes `expanded` (two-way), `disabled` and `hiding` (`until-found` by default, or `hidden`). `#collapsible="foldCollapsible"` has `state`, with `expanded` and `disabled` (the root's, not the Trigger's) signals.
- `CollapsibleTrigger`: a `<button>` styled like a [Button](#button): it takes `variant` (`secondary` by default), `size`, `class`, `id`, `disabled` and `focusableWhenDisabled`. A `link` trigger is as tall as its text, like a link Button; add `py-*` for a larger target. Don't add `foldButton` to it: the trigger already is one, and two button directives on one element aren't supported.
- `CollapsiblePanel`: the content. It takes `id` and `class`, which styles its content box (see [Class merging](#class-merging-and-slots)). `#panel="foldCollapsiblePanel"` has `state`, with an `open` signal that stays true until the closing motion ends.

- **Disabled.** The root's `disabled` blocks the trigger and find-in-page, so its closed panel is plain `hidden`; your writes to `expanded` still open and close it. The trigger's own `disabled` blocks only the trigger: the panel stays findable.
- **Panel elements.** The Panel renders two `div`s inside itself and sets `display: grid`, so it must accept flow content and keep its meaning as a grid: a `div` (the one to reach for), `section`, `article`, `aside`, `nav` or `dd`. Put a list or table inside the Panel, not on it, and put the Panel inside a `td`, `th`, `li` or `fieldset` rather than on one: a grid `td` loses its `colspan`, an `li` its marker. Nothing checks it.
- Find in page, deferred content, motion, Tab during motion and forms work as in [Accordion](#accordion), and so does the Safari 26.x VoiceOver bug, with `hiding="hidden"` as its workaround.

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
- `PopoverContent`: the panel, `role="dialog"` by default. It takes `id`, `side` (default `block-end`), `align` (default `start`), `gap` (default 4, in CSS pixels), `tabindex`, which goes to its scroller, and `class`. Its template reference, `#filters="foldPopoverContent"`, has `state`, with an `open` signal that stays `true` through the closing animation.

Name the panel with `aria-labelledby` or `aria-label`, and author it right after its Trigger, so Tab moves from the Trigger into it. Escape and an outside click close it; Escape returns focus to the Trigger. There's no close part: close it from your own button by setting `open` to `false`.

- **Gate heavy content** on the Content's `state.open()`, as above; the panel's own markup is always rendered.
- **Layout inside.** Content is a flex column only while open, so it keeps the browser's closed `display: none`, and its content sits in a ScrollArea with the 12px padding inside the scroller; lay out an inner element, like the `grid` above. Content's `class` sizes the panel: padding there goes outside the scroller.
- **Wide content.** Content wraps to the panel's width and scrolls only up and down. Put a wide table or code block in a ScrollArea of its own, `<div foldScrollArea orientation="horizontal" aria-label="…">`, which scrolls sideways with its own scrollbar while the text around it keeps wrapping.
- **Not a focus trap.** It's non-modal: Tab leaves it for the next element on the page, and focus can move anywhere while it's open.
- **Tooltips inside it** show once it's open and hide when it finishes closing, staying visible through its closing animation.
- **Keyboard and scrolling.** Content scrolls in a [ScrollArea](#scrollarea) when it's taller than the room left below or above the Trigger. Text-only Content that can scroll needs `tabindex="0"`, which fold moves to the scroller, so the keyboard can reach and scroll it in every browser (Safari skips it otherwise); the scroller then shows its inset focus ring. Interactive Content needs nothing; Firefox adds one Tab stop on the scroller while it scrolls, which `tabindex="-1"` removes. A control focused near an edge scrolls fully into view, focus ring included; the viewport's 16px scroll padding keeps it clear of the edge as far as the panel can scroll, so the distance left also depends on the content before or after the control and on the browser's focus scrolling. A wheel over the scrollbar stays in the panel like one over its content, though in Firefox either can scroll the page at the panel's end.
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
- **Submenus open beside their trigger**, 4px from it, on the inline end, flipping to the other side when that has no room. When neither side has room, as on a phone, they open 4px below it instead, or above it when there's no room below, over the other rows. Set `side` on a submenu's Content like any Content's.
- **Layout on the root.** Menu and MenuSub are `display: contents`, so their classes don't lay anything out; style the Trigger and Content.
- **One button primitive per element.** Don't add `foldButton` to a MenuTrigger; it already has the Button look.
- **Forms don't belong in a menu.** Menu rows are actions and options; for inputs, use a [Popover](#popover).
- **Scrolling.** The panel scrolls in a [ScrollArea](#scrollarea) whose viewport isn't a Tab stop. A row the keyboard focuses scrolls fully into view, focus ring included; the viewport's 16px scroll padding keeps it clear of the edge as far as the panel can scroll, so the distance left also depends on the rows before or after it and on the browser's focus scrolling. At the panel's end, a wheel over its scrollbar can scroll the page.

[Origami's README](../origami-ui/menu/README.md) describes the [keys](../origami-ui/menu/README.md#keyboard) and typeahead, [removing the row a menu belongs to](../origami-ui/menu/README.md#removing-the-row-a-menu-belongs-to), and [server rendering and hydration](../origami-ui/menu/README.md#server-rendering-and-hydration).

## Toggle

```ts
import { Toggle } from "#ui/toggle";

readonly muted = signal(false);
```

`Toggle` is a two-state button, over Origami's [Toggle](../origami-ui/toggle/README.md), which owns the behavior: the pressed state, `aria-pressed`, disabled handling and Signal Forms. Off, it's a ghost Button; on, it takes the segmented control's pressed body: the `muted` fill, the soft edge, a 1px inset `border` ring and `foreground` 600 text. On is neutral, never green:

<!-- prettier-ignore -->
```html
<button foldToggle [(checked)]="muted">Mute</button>
<button foldToggle size="icon" aria-label="Pin to sidebar" [(checked)]="pinned">
  <svg lucidePin aria-hidden="true"></svg>
</button>
<button foldToggle size="sm" [checked]="wrap()" (checkedChange)="setWrap($event)" [disabled]="readOnly()">
  <svg lucideWrapText aria-hidden="true"></svg> Wrap
</button>
<button foldToggle [(checked)]="unreadOnly">Unread <span class="text-muted-foreground">12</span></button>

<div foldField orientation="horizontal">
  <button foldToggle [formField]="form.notify" size="icon"><svg lucideBell aria-hidden="true"></svg></button>
  <label foldFieldLabel>Notify me</label>
</div>
```

`Toggle` goes on a `<button>`. It takes `checked` (two-way, `false` by default), `disabled`, `focusableWhenDisabled`, `id`, `size` (Button's `sm`, `md`, `lg` or `icon`: 28, 32 and 36px tall, or 32px square; `md` by default) and `class`, and emits `checkedChange` and `touch`. It has no `variant`. In a Field, `[formField]` binds its checked state, disabled state and touch, and the FieldLabel names it.

- **A stable name.** `aria-pressed` announces the state, so keep the label the same while it's on or off. Name an icon-only Toggle with `aria-label`.
- **Text and icons inside.** Project plain text and icons drawn in `currentColor`. Projected text, like the count above, keeps its own color, and follows the pressed text in forced-colors mode.
- **No backgrounds inside.** In forced-colors mode a pressed Toggle, ToggleGroupItem or ToolbarToggle opts out of the browser's forced colors (`forced-color-adjust: none`) and names its own system colors, and everything inside it opts out with it. An element with a background of its own, like a badge, keeps its author colors there, so its text can disappear into its fill. Leave such elements out: project plain text and `currentColor` icons. A system-color class on the element doesn't fix it, because its text still inherits the pressed text color while its own fill stays.
- **Focusable while disabled.** With `focusableWhenDisabled`, a disabled Toggle stays focusable and natively enabled. Origami doesn't press it, so `checkedChange` doesn't emit, but your own `(click)` on it still runs. Put the effect of a change on `(checkedChange)`:

  <!-- prettier-ignore -->
  ```html
  <button foldToggle [checked]="bold()" (checkedChange)="setBold($event)" [disabled]="locked()" focusableWhenDisabled>Bold</button>
  ```

- **No invalid look.** Origami sets no `aria-invalid` on a Toggle.

In forced-colors mode, an on Toggle paints `Highlight` with `HighlightText`, a disabled one `GrayText` (`Canvas` on `GrayText` while on), and an on Toggle's focus ring is `CanvasText`.

[Origami's README](../origami-ui/toggle/README.md) describes pressing, disabled toggles, Signal Forms and hydration.

## ToggleGroup

```ts
import { ToggleGroupParts } from "#ui/toggle-group";

readonly status = signal<string | null>("active");
readonly marks = signal<readonly string[]>(["bold"]);
```

`ToggleGroupSingle` and `ToggleGroupMultiple` are segmented controls, over Origami's [ToggleGroup](../origami-ui/toggle-group/README.md), which owns the behavior: the value, one Tab stop, the arrow keys, disabled items and Signal Forms. The track is 32px tall on `surface` with a 1px `input` border, 2px padding and 2px between its 26px `ToggleGroupItem`s; an unpressed item has muted 500 text, and a pressed one has Toggle's on body. A Single holds one value or `null`, a Multiple any number:

<!-- prettier-ignore -->
```html
<div foldToggleGroupSingle [(value)]="status" indicator aria-label="Status">
  <button foldToggleGroupItem value="all">All</button>
  <button foldToggleGroupItem value="active">Active</button>
  <button foldToggleGroupItem value="ending">Ending</button>
  <button foldToggleGroupItem value="overdue" [disabled]="!canSeeOverdue()">Overdue</button>
</div>

<div foldToggleGroupMultiple [(value)]="marks" aria-label="Text style">
  <button foldToggleGroupItem value="bold" aria-label="Bold"><svg lucideBold aria-hidden="true"></svg></button>
  <button foldToggleGroupItem value="italic" aria-label="Italic"><svg lucideItalic aria-hidden="true"></svg></button>
</div>

<div foldToggleGroupSingle orientation="vertical" deselectable [(value)]="density" aria-label="Density">…</div>

<div foldField>
  <span foldFieldLabel>Billing</span>
  <div foldToggleGroupSingle [formField]="form.cycle" aria-label="Billing">…</div>
</div>
```

- `ToggleGroupSingle`: takes `value` (two-way, `null` by default), `disabled`, `orientation` (`horizontal` by default, or `vertical`), `deselectable` (`false` by default: pressing the pressed item keeps it; `true` clears it to `null`), `indicator` and `class`, and emits `valueChange` and `touch`.
- `ToggleGroupMultiple`: takes `value` (two-way, `[]` by default), `disabled`, `orientation` and `class`, and emits `valueChange` and `touch`.
- `ToggleGroupItem`: a `<button>` segment. It takes `value` (required), `id`, `disabled`, `focusableWhenDisabled` and `class`.

Both roots' `focus()` focuses the item with the Tab stop, so Signal Forms' `focusBoundControl()` reaches the group. Name every group with `aria-label` or `aria-labelledby`, and icon-only items with `aria-label`.

- **The dot.** `indicator` leads the pressed item of a Single with the green status-light dot, for a group that filters the current view; at most one shows. A Multiple root doesn't take it: binding `[indicator]` there fails the template check, and a bare `indicator` attribute does nothing. A group nested inside an indicator group keeps no dot of its own. Showing the dot moves the following items 15px.
- **Vertical.** A vertical group is a column of full-width items, start-aligned.
- **Disabled.** A disabled root dims each item, not the track.
- **Focusable while disabled.** With `focusableWhenDisabled`, an item that's disabled, by itself or through its root, stays focusable and natively enabled. Origami doesn't press it, so the root's `valueChange` doesn't emit, but your own `(click)` on the item still runs. Put the effect of a change on `(valueChange)`:

  <!-- prettier-ignore -->
  ```html
  <div foldToggleGroupSingle [value]="range()" (valueChange)="setRange($event)" [disabled]="locked()" aria-label="Range">
    <button foldToggleGroupItem value="day" focusableWhenDisabled>Day</button>
    <button foldToggleGroupItem value="week" focusableWhenDisabled>Week</button>
  </div>
  ```

- **One size.** The segmented control has one size, 32px; override it with `class`.
- **In a Toolbar,** a standalone group keeps its own Tab stop. Use the [Toolbar's groups](#toolbar) to join the Toolbar's arrow keys.

[Origami's README](../origami-ui/toggle-group/README.md) describes the keys, pressing, disabled items, Signal Forms and hydration.

## Toolbar

```ts
import { ToolbarParts } from "#ui/toolbar";
import { ToggleGroupItem } from "#ui/toggle-group";
import { RadioGroupItem } from "#ui/radio-group";
import { PopoverParts } from "#ui/popover";
import { MenuParts } from "#ui/menu";
import { TooltipParts } from "#ui/tooltip";
```

`Toolbar` is a row of controls with one Tab stop, over Origami's [Toolbar](../origami-ui/toolbar/README.md), which owns the behavior: the roving Tab stop, the arrow keys along its orientation, Home and End, and each control's pressed or checked state. fold's Toolbar is a bare row, 8px between controls, that wraps whole controls and groups onto rows 8px apart. Its buttons are ghost Buttons, its groups are segmented controls or rows of radios, and its popup triggers open fold's Popover and Menu:

<!-- prettier-ignore -->
```html
<div foldToolbar aria-label="Formatting">
  <button foldToolbarButton size="icon" aria-label="Undo" (click)="undo()"><svg lucideUndo2 aria-hidden="true"></svg></button>
  <button foldToolbarButton size="icon" aria-label="Redo" [disabled]="!canRedo()" focusableWhenDisabled (click)="canRedo() && redo()">
    <svg lucideRedo2 aria-hidden="true"></svg>
  </button>

  <div foldToolbarSeparator></div>

  <div foldToolbarToggleGroupMultiple [(value)]="marks" aria-label="Text style">
    <button foldToggleGroupItem value="bold" aria-label="Bold"><svg lucideBold aria-hidden="true"></svg></button>
    <button foldToggleGroupItem value="italic" aria-label="Italic"><svg lucideItalic aria-hidden="true"></svg></button>
  </div>

  <div foldToolbarSeparator></div>

  <button foldToolbarToggle [(checked)]="spellcheck">Spell check</button>

  <div foldToolbarRadioGroup [(value)]="alignment" aria-label="Alignment">
    <button foldRadioGroupItem value="left">Left</button>
    <button foldRadioGroupItem value="center">Center</button>
  </div>

  <div foldPopover>
    <button foldToolbarPopoverTrigger>Symbol</button>
    <div foldPopoverContent aria-label="Symbols">…</div>
  </div>

  <div foldMenu>
    <button foldToolbarMenuTrigger>More <svg lucideChevronDown aria-hidden="true"></svg></button>
    <div foldMenuContent>
      <button foldMenuItem (select)="clearFormatting()">Clear formatting</button>
    </div>
  </div>

  <span foldTooltip>
    <button foldToolbarButton foldTooltipTrigger size="icon" aria-label="Copy" (click)="copy()">
      <svg lucideCopy aria-hidden="true"></svg>
    </button>
    <span foldTooltipContent>Copies the link</span>
  </span>
</div>

<div foldToolbar aria-label="View">
  <div foldToolbarToggleGroupSingle [(value)]="view" deselectable indicator aria-label="Period">
    <button foldToggleGroupItem value="week">Week</button>
    <button foldToggleGroupItem value="month">Month</button>
  </div>
</div>
```

Every part takes `class`:

- `Toolbar`: the root. It takes `orientation` (`horizontal` by default, or `vertical`, a column). Name it with `aria-label` or `aria-labelledby`.
- `ToolbarSeparator`: fold's own 1×20px rule between controls, perpendicular to the Toolbar. It must sit inside a Toolbar.
- `ToolbarButton`: a `<button>` command. Write a native `(click)`. It takes `disabled`, `focusableWhenDisabled`, `variant` (`ghost` by default, `secondary`, `primary` or `destructive`) and `size` (Button's sizes, `md` by default).
- `ToolbarToggle`: a `<button>` Toggle. It takes `checked` (two-way, `false` by default), `disabled`, `focusableWhenDisabled`, `id` and `size`, and emits `checkedChange`.
- `ToolbarToggleGroupSingle`: a segmented control of `ToggleGroupItem`s. It takes `value` (two-way, `null` by default), `disabled`, `deselectable` and `indicator`, and emits `valueChange`.
- `ToolbarToggleGroupMultiple`: the same, holding any number of values. It takes `value` (two-way, `[]` by default) and `disabled`, and emits `valueChange`.
- `ToolbarRadioGroup`: a row of `RadioGroupItem`s, 16px apart, each one 32px line, or a column in a vertical Toolbar. It takes `value` (two-way, `null` by default) and `disabled`, and emits `valueChange`.
- `ToolbarPopoverTrigger`: a `<button>` that opens the Popover it's in, and anchors it. It takes `id`, `disabled`, `focusableWhenDisabled`, `variant` and `size`, and renders `aria-haspopup="dialog"`.
- `ToolbarMenuTrigger`: a `<button>` that opens the Menu it's in. It takes `id`, `disabled`, `focusableWhenDisabled`, `variant` and `size`.

The buttons, the toggles, the groups' items and the triggers all join the Toolbar's arrow keys, in DOM order. A standalone Toggle, ToggleGroup or RadioGroup inside a Toolbar keeps its own Tab stop. Toolbar controls have no `link` variant, which has no height of its own, and the default is `ghost`, not Button's `secondary`.

- **Add what you use.** `add toolbar` copies `button`, `cn`, `toggle`, `toggle-group` and `toolbar`. Add `radio-group`, `popover`, `menu` or `tooltip` for their controls. Each popup trigger must sit inside its `foldPopover` or `foldMenu` root; without one, the first render fails with Angular's missing-provider error, on the server too.
- **Focusable while disabled.** With `focusableWhenDisabled`, a disabled ToolbarButton, ToolbarToggle, ToolbarPopoverTrigger or ToolbarMenuTrigger, or a ToggleGroupItem or RadioGroupItem disabled by itself or its group, stays focusable and natively enabled, in the arrow sequence. Origami doesn't press, check or open it, but your own `(click)` on it still runs: check the state in it, as Redo does above, and put a selection's effect on `(checkedChange)` or the group's `(valueChange)`, which don't emit while disabled.
- **Wrapping.** A group moves to the next row whole, and toolbar radios stay on one line, so a group wider than the Toolbar overflows it. For long or translated choices, use a vertical Toolbar, a standalone ToggleGroup with `orientation="vertical"`, a standalone RadioGroup, or shorter labels: a horizontal group outside the Toolbar overflows the same way. A separator can end a row, and the arrows still follow DOM order across rows.
- **A surfaced bar.** The Toolbar has no surface of its own; add `class="rounded-control border border-border bg-surface p-1"`.
- **Per control.** There's no Toolbar-wide `size` or `disabled`: a `disabled` attribute on the root does nothing. Set them on each control.
- **No Signal Forms.** `[formField]` doesn't work on toolbar toggles or groups; use a standalone Toggle or ToggleGroup in a Field.
- **Tooltips.** A Tooltip root is layout-transparent, so the control inside it stays a Toolbar control. It describes an already named control; it never names it.
- **Popup triggers** have no open look of their own, like fold's PopoverTrigger and MenuTrigger.

[Origami's README](../origami-ui/toolbar/README.md) describes the keys, the groups, the popup triggers and hydration.

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

`ScrollArea` takes `orientation` (`vertical` by default, `horizontal` or `both`), `aria-label`, `aria-labelledby`, `viewportTabIndex` and `class`. Its template reference, `#area="foldScrollArea"`, has `viewport()`, the scrolling `HTMLElement`, and `state`, with `overflowX`, `overflowY` and `active` signals.

- **Size it.** fold's Select, Combobox, Menu and Popover Content and Dialog and Sheet bodies size their ScrollArea themselves. Elsewhere, give the root a definite height (`h-*`, or `size-full` of a sized parent, with `min-h-0` in flex and grid parents), a `max-h-*` (it grows with its content up to the cap, then scrolls), or `grow` in a flex column. Without one, it grows with its content instead of scrolling. Between fixed bands in a flex column, give the bands `shrink-0`, as above, or long content shrinks them.
- **Lay out inside.** The root is a flex column fold relies on, and the scrollbars sit on its edge. Put padding, `gap`, grid or flex on an element of your own inside it. On the root, `grid` stops it scrolling, padding moves the content away from the scrollbar, and `gap` does nothing.
- **Naming.** `aria-label` and `aria-labelledby` name the viewport, the focusable scroller, which is then a `region`. Bind a changing name as `[aria-label]`, not `[attr.aria-label]`, which names the root instead. Unnamed, it's a focusable scroller without the region role.
- **The viewport.** `area.viewport()` is the native scroller, for `scrollTo()`, `scrollTop` and listeners. Call it from events and effects: during the first render it throws, since the view doesn't exist yet. It's a Tab stop by default, so the keyboard can scroll text and tables in every browser. `[viewportTabIndex]="-1"` removes the stop when its content is all controls, and `[viewportTabIndex]="null"` removes the attribute so the browser decides. A modal dialog's first scroller needs `null`: an explicit `-1` can still take the dialog's initial focus. fold's lists, Menu, Popover and Bodies set it for you. Bind it, as `[viewportTabIndex]="-1"`: the static attribute is a string and doesn't type-check.
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
    <div foldDialogBody class="my-0"><div class="py-4">…</div></div>
    <div foldDialogFooter>…</div>
  </dialog>
</div>
```

- `gap-0` on the Content removes the 20px gaps that would otherwise sit around the bar; `pb-5` on the Header and `py-4` on your element inside the Body, plus the Body's own 4px, put that space back inside them.
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

## Meter

```ts
import { Meter, MeterRing } from "#ui/meter";
```

`Meter` and `MeterRing` show a measurement within a known range, such as a disk's usage, seats taken or a share of arrivals, over Origami's [Meter](../origami-ui/meter/README.md), which owns the value, its range, the value text and the ARIA. It isn't task progress, which is [Progress](#progress). `Meter` is a bar: a 6px fill inside a 1px `input` outline with a 2px gap, 12px in all. `MeterRing` is a 96px gauge: an 8px arc from twelve o'clock, clockwise, inside the same outline and gap, with the value text centred. Both fill with the foreground color, or with `warning` and `destructive` in the regions that `low`, `high` and `optimum` place:

<!-- prettier-ignore -->
```html
<!-- No thresholds: plain foreground fill, no data-region -->
<div foldMeter [value]="quotaUsed()" aria-label="Storage quota"></div>

<!-- Lower is better: ≤60 optimum, ≤85 suboptimum, >85 worst -->
<div foldMeter [value]="disk.usedPercent" low="60" high="85" optimum="0" aria-labelledby="disk-title"></div>

<!-- Higher is better, as a ring with the percent centred -->
<div foldMeterRing [value]="result.percentage" low="40" high="70" optimum="100" aria-labelledby="arrivals-title"></div>

<!-- Own range and text, a bigger ring -->
<div foldMeterRing [value]="taken()" [max]="seats()" [valueText]="taken() + ' of ' + seats() + ' seats'"
     aria-label="Seats taken" class="size-32"></div>
```

Both take Origami's `value` (required), `min` (0 by default), `max` (100 by default) and `valueText`, fold's `low`, `high` and `optimum` (unset by default, in value units), and `class`: a height class sets a Meter's thickness (`h-4` gives a 10px fill) and a width class its length, and a `size-*` class sets a MeterRing's diameter. Their template references, `#m="foldMeter"` and `#m="foldMeterRing"`, have `state`, with Origami's `value`, `percent` and `valueText` signals.

**Name it.** ARIA requires a meter to have a name, and neither fold nor Origami gives one or warns without it. Write `aria-label` or `aria-labelledby` on the meter itself, statically or bound with `[attr.aria-label]`: the root is the `meter`, and its drawing and centred text are hidden from assistive technology, which reads its `aria-valuetext`.

### Regions

fold places native `<meter>`'s regions, as the HTML standard does, in value units within Origami's range (so `max` defaults to 100, not native's 1), and writes the region as `data-region` on the root. `low` and `high` default to `min` and `max`, and `optimum` to the middle of the range; each is clamped into it, and `high` is raised to `low`. With none of them set there's no `data-region`, and the fill is plain foreground.

| `optimum`                       | Optimum region           | Suboptimum region        | Worst region     |
| ------------------------------- | ------------------------ | ------------------------ | ---------------- |
| below `low` (lower is better)   | `value` ≤ `low`          | `low` < `value` ≤ `high` | `value` > `high` |
| between `low` and `high`        | `low` ≤ `value` ≤ `high` | the rest                 | none             |
| above `high` (higher is better) | `value` ≥ `high`         | `low` ≤ `value` < `high` | `value` < `low`  |

- The optimum region fills with `foreground`, the suboptimum region with `warning` and the worst region with `destructive`. There's no green.
- The worst region fills with `destructive`, an exception to Appliance's rule that orange fills only destructive actions. It's the token that keeps worst distinct from `warning` in both themes.
- **Colour isn't the message.** It's lost in forced colors, and in the light theme `warning` and `destructive` differ little in lightness. Put the status in `valueText`, and in visible text when it matters, as [Heading and value](#heading-and-value) does.
- The colours are measured at 3:1 or more on `surface` and `background`; on `muted`, the dark `destructive` fill falls below it.
- Recolour a region with an ordinary class, such as `destructive-text` for the worst one. It needs a `low`: with only `high="85" optimum="0"`, `low` defaults to `min` and equals the optimum, so 92 is suboptimum and never worst.

<!-- prettier-ignore -->
```html
<div foldMeter [value]="disk.usedPercent" low="60" high="85" optimum="0" aria-label="Disk"
     class="data-[region=worst]:[--meter-fill:var(--destructive-text)]"></div>
```

### Ring

- Size a ring with `size-*`; its stroke stays 8px and its text 13px at every size. A thicker stroke means editing the `ARC` mask in your copy.
- `size-24`, the default, fits about two short lines of value text; `size-20` is the smallest ring for two short lines, such as "12 of 40 seats", and `size-16` the smallest for one short value, such as "100%". Smaller rings aren't supported. These were measured with Hanken Grotesk at the default type scale, so check translated or longer copy at the size you choose: the text wraps at 64% of the ring's width and can reach the arc.
- A ring runs clockwise in right-to-left text too; a bar fills from the inline start.
- **The mask prefix.** The ring's stroke is a `mask-image`. Chrome and Edge 119 need `-webkit-mask-image`, which Angular's build adds for its default browser targets. If your CSS doesn't go through Angular's build and you support 119, add `[-webkit-mask-image:…]` with the same gradient in your copy.

### No data

`value` is required, so while there's no measurement, render your own placeholder instead of a meter, and don't use `?? 0`, which would show missing data as a real 0%:

<!-- prettier-ignore -->
```html
<h3 id="arrivals-title" class="text-title">Arrivals</h3>
@if (arrivals(); as result) {
  <div foldMeterRing [value]="result.percentage" low="40" high="70" optimum="100"
       aria-labelledby="arrivals-title"></div>
} @else {
  <p>No arrivals data for this period</p>
}
```

Origami's [Values](../origami-ui/meter/README.md#values) explains why a meter has no unknown state.

### Heading and value

The bar renders no text. Compute the text once, show it next to the heading in a span hidden from assistive technology, and pass it as `valueText`, so the meter reads the same words. Keep the heading visible to assistive technology, since it names the meter:

<!-- prettier-ignore -->
```html
<div class="flex items-baseline justify-between gap-3">
  <h3 id="disk-title" class="text-title">Disk capacity</h3>
  <span aria-hidden="true" class="tabular-nums">{{ diskText() }}</span> <!-- "92% used, critically full" -->
</div>
<div foldMeter [value]="disk().used" low="60" high="85" optimum="0" [valueText]="diskText()"
     aria-labelledby="disk-title"></div>
```

This carries the status words that colour can't, and it avoids reading `#m.state` in a binding placed before the meter, which Origami says throws NG0950.

- **Value changes** jump; the fill and the arc don't animate between values.
- **Forced colors.** In forced-colors mode the outline, fill and arc are `CanvasText` on the meter's own `Canvas`, so regions look alike.
- **Values** clamp to `[min, max]`, a value that isn't finite renders as `min`, and a `max` below `min` is raised to it; see [Origami's values table](../origami-ui/meter/README.md#values).
- **Replacing Options** in your copy of Meter or MeterRing works as [Origami's README](../origami-ui/meter/README.md#replacing-options) describes: fold reads them no earlier than Origami does.

## Page

```ts
import { Button } from "#ui/button";
import { PageParts } from "#ui/page";
```

The actions below are [Button](#button)s, so the example also needs `button` added: `ng generate @loozo/fold-ui:add --names page button`.

`Page` is a titled page frame made of directive parts on elements you write: a 20px-padded column with a header and your content. fold sets no landmark, role, name or heading level. The header puts the title block at the start and the actions at the end while both fit on one line, and wraps the actions below the title block, as a whole, when they don't:

<!-- prettier-ignore -->
```html
<main foldPage>
  <header foldPageHeader>
    <div> <!-- the title block -->
      <h1 foldPageTitle id="budgets-title">Budgets</h1>
      <p foldPageDescription>Acme Ltd · fiscal year 2026</p>
    </div>
    <div foldPageActions>
      <button foldButton>Export</button>
      <button foldButton variant="primary">New budget</button>
    </div>
  </header>
  …
</main>

<!-- Without a description, the title can be the header's direct child. -->
<header foldPageHeader>
  <h1 foldPageTitle>Budgets</h1>
  <div foldPageActions>…</div>
</header>
```

- `Page`: the frame, `flex flex-col gap-5 p-5`. It takes `class`.
- `PageHeader`: the title row. Every child except PageActions is a title block that grows from 16rem and never shrinks below it beside the actions, so the actions wrap exactly when 16rem, the 24px gap and their own width don't fit. It takes `class`.
- `PageTitle`: your heading element, usually an `<h1>`, at the 20px `text-headline` size; a long word wraps anywhere. The heading level is yours. It takes `class`.
- `PageDescription`: a muted line under the title, at most 68 characters wide. It takes `class`.
- `PageActions`: a wrapping row of buttons at the header's end. It never shrinks into the title block, and when it's alone on its line it stays inside the header, where its own buttons wrap. It takes `class`.

- **The title block.** Put PageTitle and PageDescription in one element of yours, usually a `<div>`, so they stay one block: the actions then center against both, and the order is title, description, actions at every width. Without the wrapper, the description sits beside the title on a wide screen. Write the title block before PageActions; the narrow layout follows the DOM order.
- **In a padded shell**, such as an app layout that already pads its outlet, write `<section foldPage class="p-0">`.
- **Landmarks.** `<main foldPage>` needs no name. A `<section foldPage>` stays a plain section unless you name it; don't give it the same name as a [Table](#table) region inside it, or the landmark list shows two of them.
- **Long labels.** fold's Button doesn't wrap its label, so one label wider than the header, at phone width or in translation, overflows it. Give that Button the classes Toast's action uses; a label that fits looks the same with them, one 32px line:

  ```html
  <button
    foldButton
    variant="primary"
    class="h-auto min-h-8 max-w-full py-1 text-start whitespace-normal [overflow-wrap:anywhere]"
  >
    Alle verbleibenden Budgetentwürfe zur Genehmigung einreichen
  </button>
  ```

## Table

```ts
import { CurrencyPipe } from "@angular/common";
import { Button } from "#ui/button";
import { EmptyParts } from "#ui/empty";
import { TableParts } from "#ui/table";
```

The example below also uses [Button](#button) for the row action and the pager, [Empty](#empty) for the empty row and Angular's `CurrencyPipe`, so it needs `ng generate @loozo/fold-ui:add --names table button empty` and all four in the component's `imports`. Without `Button`, the pager's `focusableWhenDisabled` has no effect and focus drops at the first or last page.

`Table` styles a native `<table>` with directive parts, inside a bordered `TableFrame` that scrolls it sideways in a [ScrollArea](#scrollarea) and holds a `TablePager` below it. The view owns every bit of state, the rows, the sort and the page; the parts only reflect it:

<!-- prettier-ignore -->
```html
<div foldTableFrame [aria-labelledby]="titleId">
  <table foldTable [attr.aria-labelledby]="titleId">
    <thead>
      <tr foldTableRow>
        <th foldTableColumnHeader [sort]="sortOf('name')">
          <button foldTableSortButton (click)="toggleSort('name')">Name</button>
        </th>
        <th foldTableColumnHeader align="end" [sort]="sortOf('amount')">
          <button foldTableSortButton (click)="toggleSort('amount')">Amount</button>
        </th>
        <th foldTableColumnHeader align="end"><span class="sr-only">Actions</span></th>
      </tr>
    </thead>
    <tbody>
      @for (budget of visible(); track budget.id) {
        <tr foldTableRow>
          <td foldTableCell>{{ budget.name }}</td>
          <td foldTableCell align="end">{{ budget.amount | currency: "EUR" }}</td>
          <td foldTableCell align="end"><button foldButton size="sm">Submit</button></td>
        </tr>
      } @empty {
        <tr foldTableRow>
          <td foldTableCell colspan="3"><div foldEmpty>No budgets match</div></td>
        </tr>
      }
    </tbody>
  </table>
  <nav foldTablePager aria-label="Budgets pages">
    <output>{{ rangeText() }}</output>
    <button foldButton size="sm" [disabled]="!hasPrevious()" focusableWhenDisabled (click)="previous()">Previous</button>
    <button foldButton size="sm" [disabled]="!hasNext()" focusableWhenDisabled (click)="next()">Next</button>
  </nav>
</div>
```

- `TableFrame`: an element, usually a `<div>`, around the table and its pager: a rounded surface with a 1px border. The table scrolls sideways in a horizontal ScrollArea; the pager stays below it. Write the table as the frame's direct child: the frame's own styles, the last row's border and the full-span Empty, reach only that table, not one inside a wrapper element. It takes `aria-labelledby`, `aria-label` and `class`.
- `Table`: a native `<table>`, full width with collapsed borders. Name it with `aria-labelledby` or `aria-label`. It takes `class`. `<thead>`, `<tbody>` and `<tfoot>` stay plain native elements.
- `TableRow`: a native `<tr>` with a 1px bottom border; the frame drops it from the last row of its own table's last `<tbody>` that has rows, so rows grouped in several bodies keep the line between groups, even when the last group is empty. It takes `class`.
- `TableColumnHeader`: a native `<th>`, with `scope="col"`, muted 12px text. It takes `align` (`start` by default, or `end`), `sort` (`ascending`, `descending`, or `null` by default for unsorted), which it reflects as `aria-sort`, and `class`. It exports the `TableAlign` and `TableSort` types.
- `TableSortButton`: a native `<button>` inside a TableColumnHeader, with `type="button"`: its label and an arrow, ↑ or ↓ for the header's `sort`, or ↕ while unsorted, in the label's muted color, so a sortable column shows without hover. The sorted column's label is in the foreground color. In an end-aligned column the arrow leads. It reads its header and writes nothing: your `(click)` changes the view's sort. Outside a TableColumnHeader it fails with NG0201. It takes `class`.
- `TableCell`: a native `<td>`. It takes `align` (`start` by default, or `end`, with tabular figures for money and numbers) and `class`. Give a column's header and cells the same `align`.
- `TablePager`: a native `<nav>` at the frame's bottom: a row of muted 12px text with tabular figures, its first child, such as an `<output>`, at the start, unless it's a button or a link, which stays at the end with the other buttons. The name, the text, the buttons and their checks are yours. It takes `class`.

- **Sorting.** The view keeps one sort, binds it to each sortable header's `sort` and changes it in the buttons' `(click)`; fold doesn't sort. One header carries `aria-sort` at a time because the view keeps one key. Whether a screen reader announces the new `aria-sort` while focus stays on the button varies by reader; for an announcement, add a polite status text of your own. A click before hydration is lost unless the app enables Angular's event replay.
- **Paging.** Give the pager buttons `focusableWhenDisabled`, so the one you just pressed keeps focus at the first or last page instead of dropping it to `<body>`. A focusable disabled button still fires `(click)`, so each handler checks its boundary:

  ```ts
  protected next(): void {
    if (!this.hasNext()) {
      return;
    }

    this.page.update((page) => page + 1);
  }
  ```

  `<output>` is a polite status, so a screen reader hears the new range. When a page has more than one list, name each pager for its list, such as "Budgets pages" and "Archived budgets pages".

- **While loading.** The header and the pager describe the rows on screen: keep the old rows and their sort and range until the response arrives, or show a pending state of your own first. A failed request leaves the last rows. Loading and failure aren't the Empty state: an `@empty` branch over a list that starts as `[]` shows "No budgets match" before the first response, so branch on the request's status first.
- **Action columns.** A header without text, such as over row buttons, has no name; write visually hidden text in it, as above.
- **Naming.** Name the frame with `[aria-labelledby]` (an element's id, usually the page title's) or `[aria-label]`, as inputs: the name moves to the scrolling viewport, which becomes a named region, and never stays on the frame. Static names work as plain attributes too: `aria-labelledby="budgets-title"`. `[attr.aria-labelledby]` on the frame writes to the frame itself and leaves the focusable viewport unnamed.
- **A Tab stop.** The viewport is always a Tab stop, so the keyboard reaches and scrolls a wide table before and after hydration. When the table fits, such as on a desktop, the stop remains: Tab goes from the control before the frame to the scroller, then to the first sort button.
- **Empty rows.** An Empty that is the direct child of a body row's only cell with a `colspan`, as in the `@empty` row above, stays inside the visible width while a wide table scrolls: it's as wide as the viewport less the cell's 12px padding on each side, and sticky 12px from its start. Write the recipe as shown: the cell's `colspan` is the column count, so it spans every column, it keeps TableCell's padding, and the table is the frame's direct child. An Empty in a row with other cells, in a cell without a `colspan`, such as one beside a `rowspan`, or in a table nested in a cell, keeps its own layout.
- **Width.** The frame's scroller is a size container, so a frame that sizes to its content, such as in a flex row without a basis, `w-fit` or `inline-block`, takes its pager's width instead of its table's. Give such a frame a width: `w-full` or `basis-full`.
- **Content doesn't wrap.** A sideways-scrolling table sizes to its content, so cell text never wraps; a long name widens the table, which scrolls.
- **Overflow.** The frame clips what overflows it. Row-action popups such as Menu and Popover are in the top layer, which escapes it.

[ScrollArea](#scrollarea) describes the scroller's thumbs.

## Badge

```ts
import { Badge } from "#ui/badge";
```

`Badge` is a status label: a 20px pill of 12px text in a soft tint of its tone. Its text carries the status, so color is never the only cue, and it isn't a live region:

```html
<span foldBadge>Draft</span>
<span foldBadge tone="info">Submitted by Ada Lovelace</span>
<span foldBadge tone="success">Approved · BUD-2026-0042</span>
<span foldBadge tone="warning">Over limit</span>
<span foldBadge tone="danger">Rejected</span>
```

`Badge` goes on an HTML element, usually a `<span>`. It takes `tone` (`neutral` by default, `info`, `success`, `warning` or `danger`) and `class`, and sets `data-tone`.

- **Colors.** The tint is the tone at 12%, and the text is 80% tone and 20% foreground. With the shipped palette the text reads at 4.5:1 or more on the background and on a surface, in both themes and in a `.light` subtree. A re-themed palette carries no contrast guarantee: check yours.
- **Forced colors.** The tint drops, and the Badge keeps an outline in the system text color.
- **No wrapping.** A long label keeps one line, so in a table it widens its column.

## Empty

```ts
import { Button } from "#ui/button";
import { EmptyParts } from "#ui/empty";
```

The second example's action is a [Button](#button), so it also needs `button` added: `ng generate @loozo/fold-ui:add --names empty button`.

`Empty` is an empty-state block: centered, muted text, with an optional title, description and actions. Plain projected text works alone:

```html
<div foldEmpty>No budgets match</div>

<div foldEmpty>
  <h2 foldEmptyTitle>No budgets yet</h2>
  <p foldEmptyDescription>Create the first budget for fiscal year 2026; it starts as a draft.</p>
  <div foldEmptyActions><button foldButton variant="primary">New budget</button></div>
</div>
```

- `Empty`: the block, with 40px of space above and below. It takes `class`.
- `EmptyTitle`: the title in the foreground color, at the 15px `text-title` size. The heading level is yours. It takes `class`.
- `EmptyDescription`: muted text, at most 48 characters wide. It takes `class`.
- `EmptyActions`: a centered, wrapping row of buttons or links. It takes `class`.

- **Not a live region.** An Empty that replaces rows isn't announced; the change that emptied the list, such as a search, says so.
- **Not loading.** Loading or a failed request isn't the empty state; see [Table](#table)'s "While loading".
- **Long words.** A word too long for the line, such as a pasted reference in a search, wraps anywhere instead of overflowing.
- **In a table**, put the Empty inside a cell that spans every column with a `colspan`, as [Table](#table)'s Empty rows describe, never on the cell itself: both bind the element's classes.

## Calendar

```ts
import { Calendar, CalendarMultiple, CalendarRange, MonthCalendar } from "#ui/calendar";
```

Four inline calendars over Origami's [Calendar](../origami-ui/calendar/README.md), which owns the behavior: the value and selection rules, a range's pending first day and preview, the keys, focus and the single tab stop, bounds, the drill-down on choosing a month or year, Escape, Field membership, Signal Forms, and server rendering and hydration. Unlike other fold parts, each root renders its own markup, the header and the current view's grid with every cell, so write nothing inside it: children are dropped.

<!-- prettier-ignore -->
```html
<div foldField #due="foldField">
  <span foldFieldLabel>Appeal date</span>
  <div foldCalendar [formField]="appeal.date" minDate="2026-10-05" [weekStart]="1" selectedDescription="selected"></div>
  @if (due.state.errorsShown()) {
    <p foldFieldError>{{ due.state.errors()[0]?.message }}</p>
  }
</div>

<div foldCalendarMultiple [(value)]="holidays" [weekStart]="1" selectedDescription="selected"></div>
<div foldCalendarRange [formField]="filters.period" [weekStart]="1" fixedWeeks selectedDescription="selected"></div>
<div foldMonthCalendar [(value)]="billingMonth" maxMonth="2026-12" selectedDescription="selected"></div>
```

A Calendar is 250px wide in a bordered `surface` box: a 32px header with ghost ‹ and › buttons around a ghost button showing the heading, a weekday row, and 32px day cells, each holding a 28px chip, so neighbouring chosen days are separate chips 4px apart. A chosen day is a `foreground` chip with `background` text; today has a 4px green dot; outside days are muted; disabled days are dimmed and struck through. A range is an 8% band across whole cells, with rounded ends and filled end chips. The months and years views are 3×4 grids of 36px chips.

- `Calendar`: one day, a `YYYY-MM-DD` string or null.
- `CalendarMultiple`: several days, an array of `YYYY-MM-DD` strings; each choice adds or removes one.
- `CalendarRange`: a range, `{ start, end }` or null. The first choice sets a pending first day, which fills; the second writes the range. While the first day is pending, the band shows the range the next choice writes, from it to the hovered day, else the focused one, as square cells, and the committed range steps back until the second choice or Escape. A polite prompt under the grid says "Choose the first day" or "Choose the last day"; it's hidden while the Calendar is readonly or disabled.
- `MonthCalendar`: one month, a `YYYY-MM` string or null; it has the months and years views only.

The day roots take Origami's `value`, `month` and `view` (all two-way), `minDate`, `maxDate`, `dateDisabled`, `weekStart`, `locale`, `today`, `fixedWeeks`, `disabled`, `readonly`, `selectedDescription` and `class`. `MonthCalendar` takes `value`, `month`, `view`, `minMonth`, `maxMonth`, `monthDisabled`, `locale`, `today`, `disabled`, `readonly`, `selectedDescription` and `class`. They emit `valueChange`, `monthChange`, `viewChange` and `touch`. `weekStart` is a number, `1` (Monday) to `7`, so bind it: `[weekStart]="1"`. A template reference, `#cal="foldCalendar"` (`foldCalendarMultiple`, `foldCalendarRange`, `foldMonthCalendar`), has Origami's `state`, such as `state.heading()`, and `focus()`.

- **Choosing the month and year.** The heading is the view switch: days → months → years → days (MonthCalendar: months → years → months), and it keeps focus. Choosing a month or year drills down; Escape goes back. Previous and Next step a month, a year or twelve years by view. Origami's live Heading is a visually hidden sibling of the switch, so screen readers announce the new period and the grid is named by it.
- **Names.** The switch's name is the heading followed by what it shows next, "October 2026, show the months"; Previous and Next are "Previous month", "Next year" and so on. `provideCalendarLabels` replaces these and the range prompts, app-wide in `app.config.ts` or for one subtree in a component's `providers`. Give the whole object; nothing merges with the English defaults:

  ```ts
  import { provideCalendarLabels } from "#ui/calendar";

  provideCalendarLabels({
    previous: {
      days: $localize`Previous month`,
      months: $localize`Previous year`,
      years: $localize`Previous 12 years`,
    },
    next: {
      days: $localize`Next month`,
      months: $localize`Next year`,
      years: $localize`Next 12 years`,
    },
    show: {
      days: $localize`show the days`,
      months: $localize`show the months`,
      years: $localize`show the years`,
    },
    chooseFirstDay: $localize`Choose the first day`,
    chooseLastDay: $localize`Choose the last day`,
  });
  ```

- **`selectedDescription` on every root.** VoiceOver ignores `aria-selected` on a focusable cell, so it says this word on a chosen day; without it, VoiceOver is silent about selection. Origami ships no translations, so pass it per Calendar, translated (`i18n-selectedDescription`). VoiceOver says it when focus returns to a chosen day, not at the moment of choosing; NVDA says "selected. selected" on Enter; under CalendarRange, VoiceOver says it on every day of the range. See [Origami's Accessibility](../origami-ui/calendar/README.md#accessibility).
- **Fields.** In a Field, the grid joins it: the FieldLabel, a `<span>`, names the grid before the heading, and errors and the required state reach it. Clicking the label does nothing. A standalone Calendar outside a Field is named by its heading alone. Invalid turns the box's border orange, readonly dashes it and drops its fill, disabled dims it.
- **Readonly and disabled.** A readonly Calendar browses and drills down but doesn't choose. Disabled days stay focusable and aren't chosen.
- **Touch.** Moving between the cells and the header with Tab doesn't touch the field. On macOS Safari, where a click doesn't focus a button, clicking Previous, Next or the view switch from a focused day does, so a required field can show its error while you're still browsing; see [Origami's Forms and Fields](../origami-ui/calendar/README.md#forms-and-fields).
- **`focus()`** (and Signal Forms' `focusBoundControl()`) focuses the grid's tab stop: the day that last had focus while it's displayed, which after a value written from code can be another day than the new value.
- **Today.** `today` isn't refreshed at midnight. While hydrating, it's the server's today. The root's own `data-today` is Origami's hydration seed, not the `today` input: style today from the cell's `data-today`.
- **Height.** The days view has four to six weeks, so its grid is 156 to 220px tall; `fixedWeeks` keeps six, for a stable height.
- **Focus ring.** The ring is fold's 2px green ring, drawn 2px outside the chip: on a day cell's edge (`outline-offset: 0`, the chip being 2px inside it) and 4px inside a month or year cell. The focused cell is raised (`relative z-1`) so that in forced colors, neighbouring range rails don't paint over it. Today's dot is 4px without the status light's halo, which doesn't fit under a 13px numeral.
- **Forced colors.** A chosen day, a range's ends and the pending first day are `Highlight` with `HighlightText`; a range's interior and the preview draw a `Highlight` rail, two 1px lines along the chips' edges, since the band's background is forced away; disabled days are `GrayText`. In the months and years views, the displayed period has a `CanvasText` border and the one holding a day root's value a 2px `Highlight` ring inside the chip.
- **In a date picker,** bind the form on the picker, never a second `[formField]` on the Calendar inside it.

[Origami's README](../origami-ui/calendar/README.md) describes the keys, bounds, locale, week start and hydration.

## DateField

```ts
import {
  DateField,
  DateFieldInput,
  DateTimeField,
  TimeField,
  provideDateFieldPlaceholders,
} from "#ui/date-field";
```

Typed dates and times over Origami's [Date field](../origami-ui/date-field/README.md), which owns the behavior: the segments' layout in the locale's order, typing and keys, half-typed drafts and their parse errors, the value, Field membership, Signal Forms, and server rendering and hydration. A root holds one `DateFieldInput`, the box, which renders the segments and their separators itself, so write nothing else inside it.

<!-- prettier-ignore -->
```html
<div foldField #dob="foldField">
  <span foldFieldLabel>Date of birth</span>
  <div foldDateField [formField]="form.dateOfBirth"><div foldDateFieldInput></div></div>
  @if (dob.state.errorsShown()) {
    @switch (dob.state.errors()[0]?.kind) {
      @case ("dateIncomplete") { <p foldFieldError>Enter a complete date</p> }
      @case ("dateInvalid") { <p foldFieldError>This date doesn't exist</p> }
      @default { <p foldFieldError>{{ dob.state.errors()[0]?.message }}</p> }
    }
  }
</div>

<div foldTimeField [(value)]="opensAt" hourCycle="12" precision="second">
  <div foldDateFieldInput aria-label="Opens at"></div>
</div>
<div foldField>
  <span foldFieldLabel>Starts at</span>
  <div foldDateTimeField [formField]="form.startsAt"><div foldDateFieldInput></div></div>
</div>
```

- `DateField`: a day, a `YYYY-MM-DD` string or null.
- `TimeField`: a time of day, `HH:mm`, or `HH:mm:ss` with `precision="second"`, or null; `hourCycle` is `12` or `24`, the locale's by default.
- `DateTimeField`: a civil date and time, `YYYY-MM-DDTHH:mm` (or with seconds), or null. No value carries a time zone: see [Time zones are yours](../origami-ui/date-field/README.md#time-zones-are-yours).
- `DateFieldInput`: Input's look, a 32px box, `w-full`, with the segments in tabular figures. Size it with a class, `h-7` or `h-9`. In a Field, the FieldLabel, a `<span>`, names it; clicking the label does nothing. Standalone, give it an `aria-label`.

The roots take Origami's `value` (two-way), `locale`, `disabled`, `readonly` and `class`, and TimeField and DateTimeField `precision` and `hourCycle`; they emit `valueChange` and `touch`. A template reference, `#dob="foldDateField"` (`foldTimeField`, `foldDateTimeField`), has Origami's `state`, such as `state.parseErrors()`, `focus()` and `clear()`.

- **Looks.** An empty segment shows its token, muted. The focused segment is an inverse chip, `foreground` with `background` text, hugging its text with 2px each side, and the box draws fold's green ring. A digit unit's chip is centred in its cell, clear of both separators; the day period's sits at its cell's start. Invalid turns the border orange, and it stays orange under the ring while you fix it, like Input. Readonly dashes the border and drops the fill; disabled dims the box.
- **Nothing moves while you type.** Each segment sits in a cell as wide as its widest state, sized by invisible copies of its tokens and digits. Filled values sit evenly between their separators. The empty field's tokens are spaced less evenly (`dd /mm/ yyyy`), and once filled the gap before AM/PM is a few pixels wider than after the minute.
- **Placeholders.** fold's English tokens are `dd`, `mm`, `yyyy`, `hh`, `mm`, `ss` and `AM/PM`; screen readers announce an empty segment by its token. `provideDateFieldPlaceholders` replaces them, app-wide in `app.config.ts` or for one subtree in a component's `providers`; give every unit. The tokens size their own segments, with two rules: a `dayPeriod` token at least as wide as the locale's AM and PM names, or the field shifts when the period is filled or cleared; and a `year` token no wider than a two-letter token followed by two digits, or the filled year's gaps are uneven.

  ```ts
  provideDateFieldPlaceholders({
    year: $localize`εεεε`,
    month: $localize`μμ`,
    day: $localize`ηη`,
    hour: $localize`ωω`,
    minute: $localize`λλ`,
    second: $localize`δδ`,
    dayPeriod: $localize`π.μ./μ.μ.`,
  });
  ```

- **Half-typed dates.** A half-typed date keeps the last complete value and reports `dateIncomplete`, so a submit checks validity, not presence; `dateInvalid` is a date that doesn't exist. The messages are yours. `clear()` throws the draft and its error away and writes null. See [Origami's Half-typed and impossible dates](../origami-ui/date-field/README.md#half-typed-and-impossible-dates).
- **Clicks.** A click on the box's empty end or on a separator focuses no segment; click a segment. The box is full width like every fold control.
- **Narrow boxes.** The cells and separators sit in a row, `date-field-segments`, that scrolls sideways when the box is narrower than them, with no scrollbar. Moving focus to a segment scrolls it wholly into view, also after you've scrolled the row yourself, so the others can shift sideways as you move. A wheel, trackpad or swipe scrolls the row to either end. It snaps to the start of a segment's cell, 2.5rem in from the row's edge (less in a row under 108px, so that 1.75rem is always left between the two sides), or to the row's end, and never back to the focused segment. After a manual scroll, a segment can stay partly shown when keyboard focus reaches it if it's wider than 2.5rem or the row is narrower than about 70px (seen in Firefox; a DateTimeField box under about 90px). In Firefox, in a row under about 90px (a DateTimeField box under about 110px), the focused chip's edge can also be cut by up to 2px, with its text whole. A DatePickerTrigger stays at the box's end, outside the row.
- **Forced colors.** The focused segment is `Highlight` with `HighlightText`; empty and disabled segments are `GrayText`. Segments draw no outline of their own: the chip and the box's ring show focus.
- **Locales.** The cells are sized with Latin digits, so in a locale with other digits, such as Arabic-Indic, segments can shift as you type. In locales whose day period comes before the hour (`ko`, `zh`, `ja`), its spare width sits before the hour. Hanken Grotesk has no Greek, so Greek tokens render in the system's fallback font.

## DatePicker

```ts
import {
  DatePickerMultipleParts,
  DatePickerParts,
  DatePickerRangeParts,
  DateTimePickerParts,
  MonthPickerParts,
} from "#ui/date-picker";
```

Date pickers over Origami's [Date picker](../origami-ui/date-picker/README.md), which owns the behavior: the value, opening and closing, placement, Escape, leaving and touch, focus moves, the Field wiring, Signal Forms and the Calendar bridge. Their popup holds fold's [Calendar](#calendar) on the floating layers' surface. There are five roots: DatePicker for a single day, DatePickerMultiple, DatePickerRange and MonthPicker for [several days, a range or a month](#several-days-a-range-or-a-month), and DateTimePicker for a [date and time](#date-and-time). They share one DatePickerTrigger, DatePickerContent and DatePickerFooter; write the DatePickerTrigger inside one of the five roots, which it reads its value and readonly state from.

The single picker comes in two shapes, decided by where you write the Trigger:

<!-- prettier-ignore -->
```html
<!-- field shape: typed segments with a calendar button at the box's end -->
<div foldField>
  <span foldFieldLabel>Due date</span>
  <div foldDatePicker [formField]="form.dueDate">
    <div foldDateFieldInput>
      <button foldDatePickerTrigger aria-label="Choose due date" i18n-aria-label></button>
    </div>
    <div foldDatePickerContent align="end" #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldCalendar [weekStart]="1" selectedDescription="selected"></div>
      }
    </div>
  </div>
</div>

<!-- button shape: a trigger showing the date you format -->
<div foldField>
  <span foldFieldLabel>From</span>
  <div foldDatePicker [formField]="search.dateFrom" #from="foldDatePicker">
    <button foldDatePickerTrigger>{{ (from.state.value() | date) ?? "Choose a date" }}</button>
    <div foldDatePickerContent #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldCalendar selectedDescription="selected"></div>
      }
    </div>
  </div>
</div>
```

`DatePickerParts` imports DatePicker, DateFieldInput, DatePickerTrigger, DatePickerContent, DatePickerFooter and Calendar. The root takes Origami's `value` and `open` (both two-way), `locale`, `disabled`, `readonly` and `class`, and emits `valueChange`, `openChange` and `touch`; `#picker="foldDatePicker"` has Origami's `state`, `focus()` and `clear()`. The value is a `YYYY-MM-DD` string or null.

- **Field shape.** A `DatePickerTrigger` inside the `DateFieldInput` is a 28px ghost square with a calendar icon, 1px inside the box's border, with an inset focus ring. Its `aria-label` is its only name and the popup's, in a Field too, so name the field in it ("Choose due date", not "Choose date"), or name `DatePickerContent` with its own `aria-label` or `aria-labelledby`. Write `align="end"` on Content: the popup's end then lines up with the Trigger, 2px inside the box's end and 2px below it, as NumberField's buttons sit 2px inside the same box. Without it, the popup starts at the icon and slides into view.
- **Button shape.** A `DatePickerTrigger` written alone is Select's trigger with a trailing calendar icon, showing your text: format the date yourself, with `DatePipe` or `Intl` (in local time; see [Several days, a range or a month](#several-days-a-range-or-a-month) for DatePipe's timezone). It's the Field's control, labelled by the FieldLabel. fold marks it `data-placeholder` while the value is empty (null, or no days), which mutes it, and `data-readonly` while the picker is readonly, whether by its own `readonly` or a Signal Forms rule, which dashes it, drops its fill and shadow and sets the default cursor. Both are `""` or absent, never `"false"`, and the field shape has neither. A picker readonly through its own `readonly` input doesn't tell screen readers (no `aria-readonly`); a Field's readonly rule does.
- **Gate the Calendar on Content's `state.open()`,** as above, not the picker's: Content keeps the Calendar until focus is back on the Trigger. Gated on the picker's `state.open()`, focus falls to the page after a choice. Bind the form on the picker, never on the Calendar.
- **Disabled.** A disabled root dims the whole box once; the Trigger inside it stays out of the Tab order unless it's `focusableWhenDisabled`. A Trigger disabled on its own dims itself and leaves the segments editable. Readonly and disabled together look disabled, with one dim and the `not-allowed` cursor, over the dashed readonly border.
- **Forms.** Bind with Signal Forms' `[formField]` or `[(value)]`: a civil ISO string or `null`, with no ControlValueAccessor, so a reactive `FormControl` doesn't bind. Bind `null` for empty, not `""`: a value that isn't a canonical day counts as not empty, so the button shape shows your text for it unmuted.
- **Popup.** DatePickerContent is the [floating layers'](#floating-layers) surface with 12px padding, 4px from the Trigger by default (`side`, `align` and `gap` inputs), at most the viewport's width less 16px and scrolling within the room left. The Calendar inside drops its own border, fill, radius and padding. Origami focuses the Calendar's day before the popup's height settles, so in a popup shorter than the Calendar that day could open out of view; the popup snaps the focused cell into view, centred and 12px clear of its edges. The Calendar's header and each of its rows are snap points too, so a wheel or trackpad scroll reaches the header and the last row and stays there; a small scroll can settle on the nearest row. Content stacks what you write in it 12px apart, such as the Calendar and a DatePickerFooter, and the end of each is a snap point as well, so a manual scroll reaches the range's prompt under the grid and a footer. After that scroll, the focused cell can sit partly outside the popup until a key moves focus to another cell, which scrolls that cell into view with its whole focus ring. A key that can't move focus, such as one stopped at the earliest or latest allowed date, leaves the cell where it is.
- **Clicks.** A click on a segment while the popup is open closes it and focuses the segment.

[Origami's README](../origami-ui/date-picker/README.md) describes opening and choosing, Escape inside a Dialog, leaving and touch.

### Several days, a range or a month

DatePickerMultiple, DatePickerRange and MonthPicker are button-shaped only: a DatePickerTrigger alone, showing your text, with a CalendarMultiple, a CalendarRange or a MonthCalendar in the popup.

<!-- prettier-ignore -->
```html
<div foldField>
  <span foldFieldLabel>Holidays</span>
  <div foldDatePickerMultiple [formField]="form.holidays" [(open)]="holidaysOpen" #holidays="foldDatePickerMultiple">
    <button foldDatePickerTrigger>
      @switch (holidays.state.value().length) {
        @case (0) { Choose days }
        @case (1) { 1 day }
        @default { {{ holidays.state.value().length }} days }
      }
    </button>
    <div foldDatePickerContent #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldCalendarMultiple [weekStart]="1" selectedDescription="selected"></div>
        <div foldDatePickerFooter>
          <button foldButton size="sm" (click)="holidaysOpen.set(false)">Done</button>
        </div>
      }
    </div>
  </div>
</div>

<div foldField>
  <span foldFieldLabel>Stay</span>
  <div foldDatePickerRange [formField]="form.stay" #stay="foldDatePickerRange">
    <button foldDatePickerTrigger>
      @if (stay.state.value(); as range) {
        {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
      } @else {
        Choose dates
      }
    </button>
    <div foldDatePickerContent #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldCalendarRange [weekStart]="1" selectedDescription="selected"></div>
      }
    </div>
  </div>
</div>

<div foldField>
  <span foldFieldLabel>Billing month</span>
  <div foldMonthPicker [formField]="form.billingMonth" #billing="foldMonthPicker">
    <button foldDatePickerTrigger>{{ (billing.state.value() | date: "MMMM y") ?? "Choose a month" }}</button>
    <div foldDatePickerContent #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldMonthCalendar selectedDescription="selected"></div>
      }
    </div>
  </div>
</div>
```

```ts
import { DatePipe } from "@angular/common";
import { Button } from "#ui/button";
import { DatePickerMultipleParts, DatePickerRangeParts, MonthPickerParts } from "#ui/date-picker";
// imports: [Button, DatePipe, DatePickerMultipleParts, DatePickerRangeParts, MonthPickerParts, …]
protected readonly holidaysOpen = signal(false);
```

Each Parts array imports its root, DatePickerTrigger, DatePickerContent, DatePickerFooter and its Calendar. The roots take Origami's `value` and `open` (both two-way), `disabled`, `readonly` and `class`, and emit `valueChange`, `openChange` and `touch`; `#picker="foldDatePickerRange"` (or `foldDatePickerMultiple`, `foldMonthPicker`) has Origami's `state` and `focus()`. They have no field shape, `locale` or `clear()`: write `[]` or `null` to empty them.

- **Values.** The multiple picker's is a `readonly string[]` of `YYYY-MM-DD` days, empty for none; the range's `{ start, end }` with `YYYY-MM-DD` days, or null; the month's a `YYYY-MM` string or null.
- **Closing.** The multiple picker stays open while you toggle days: give it a Done button in a `DatePickerFooter` that writes `open`, as above, or rely on Escape, a click outside and Tab, which close it too; focus returns to the Trigger from Done. The range closes on its second day, and Escape drops a pending first day before it closes. The month picker closes on a month, not a year.
- **Opening.** The popup opens on the month of the first chosen day or of the range's start (today's month when empty). Chosen days in other months, or a range's end in a later one, are a Next away.
- **Text.** The trigger's text is yours, as for the single picker. A count never truncates; a list of days or a long range truncates in a narrow trigger, with the whole text still in its accessible name. `Intl.DateTimeFormat`'s `formatRange` writes a compact range ("3–10 Nov 2026"). `DatePipe` reads a `YYYY-MM` month or `YYYY-MM-DD` day as local midnight, so it shows the chosen month or day as long as it also formats in local time: a `timezone` argument, or a `DATE_PIPE_DEFAULT_OPTIONS` timezone, that isn't the user's shifts it (with `UTC` set in Tokyo, `"2026-10" | date: "MMMM y"` is "September 2026"). So pass no `timezone` for these civil values, and in an app whose `DATE_PIPE_DEFAULT_OPTIONS` sets one, which still applies when you pass none, format them with `Intl` in UTC instead: `new Date("2026-10")` reads the string as UTC midnight, so `new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })` shows October 2026 in every time zone (without `timeZone: "UTC"` it shows September west of UTC).
- **Footer.** `DatePickerFooter` is a row for your own buttons at the popup's end, right-aligned, 8px apart and as wide as the Calendar: Done here, or a Today or Clear on any picker that writes `value`.

### Date and time

DateTimePicker is the field shape only: the date and time typed into a DateFieldInput, with the calendar button at its end and a single-day Calendar in the popup.

<!-- prettier-ignore -->
```html
<div foldField #starts="foldField">
  <span foldFieldLabel>Starts at</span>
  <div foldDateTimePicker [formField]="form.startsAt" locale="en-GB">
    <div foldDateFieldInput>
      <button foldDatePickerTrigger aria-label="Choose start date" i18n-aria-label></button>
    </div>
    <div foldDatePickerContent align="end" #content="foldDatePickerContent">
      @if (content.state.open()) {
        <div foldCalendar [weekStart]="1" selectedDescription="selected"></div>
      }
    </div>
  </div>
  @if (starts.state.errorsShown()) {
    @switch (starts.state.errors()[0]?.kind) {
      @case ("dateTimeIncomplete") { <p foldFieldError>Enter a complete date and time</p> }
      @case ("dateInvalid") { <p foldFieldError>This date doesn't exist</p> }
      @default { <p foldFieldError>{{ starts.state.errors()[0]?.message }}</p> }
    }
  }
</div>
```

`DateTimePickerParts` imports DateTimePicker, DateFieldInput, DatePickerTrigger, DatePickerContent, DatePickerFooter and Calendar. The root takes Origami's `value` and `open` (both two-way), `locale`, `precision`, `hourCycle`, `disabled`, `readonly` and `class`, and emits `valueChange`, `openChange` and `touch`; `#picker="foldDateTimePicker"` has Origami's `state`, `focus()` and `clear()`.

- **Value.** A civil `YYYY-MM-DDTHH:mm` string (with `:ss` at `precision="second"`) or null, with no time zone: convert at your app's boundary ([Time zones are yours](../origami-ui/date-field/README.md#time-zones-are-yours)).
- **Choosing.** A day sets the date and keeps the typed time. While the time is incomplete, the value doesn't change: Origami reports `dateTimeIncomplete` and focuses the first empty segment, usually the hour, scrolling a narrow row to it. The error shows once focus leaves the picker.
- **Shape.** Write the Trigger inside the DateFieldInput, with `align="end"` on Content, as the single picker's field shape; Origami has no button shape for it. The trigger's `aria-label` names the popup too, and it opens a Calendar for the date only, so name the field in it.
- **Narrow boxes.** [DateField's](#datefield) note applies, the trigger's 28px included: a DateTimePicker box under about 110px has a row under about 70px, and one under about 130px a row under about 90px.

## Floating layers

Select, Combobox, Popover, Menu and DatePicker share one look from `popup`, and Tooltip shares its motion: a folder of class lists with no Angular code, which your own panels can use too:

- `popupClasses`: a floating surface: 12px radius, the surface fill, a 1px border, 4px padding, the popover shadow, and the entrance and exit animations. Width and padding beyond that are yours.
- `popupMotionClasses`: the entrance and exit animations alone, for a floating layer with a look of its own, like Tooltip's chip. `popupClasses` includes them.
- `popupListClasses`: a list anchored to its trigger: at least as wide as it, at most the viewport's width less 16px, and at most 20rem tall or the room left less 8px, and a flex column while open, so a ScrollArea inside it scrolls.
- `optionClasses`: a 32px option row with a 6px radius, an 8% foreground tint while highlighted, a check (its direct `<svg>` child) shown while selected, and 50% opacity when disabled.
- `menuItemClasses`: a 32px menu row with a 6px radius, the 8% foreground fill on real focus (`:focus`, which the mouse moves too), the 2px focus ring on keyboard focus, and 50% opacity when disabled.

```ts
import { cn } from "#ui/cn";
import { popupClasses } from "#ui/popup";

protected readonly classes = computed(() => cn(popupClasses, "w-72 p-3", this.class()));
```

- **Motion.** The list, panel or chip fades in and scales from 96% over 120ms once Origami has placed it, and reverses when it closes, from its center whichever side it opens on. Under reduced motion it doesn't animate, and it's hidden when Angular renders the close.
- **Out of the Tab order.** Select's, Combobox's and Menu's Content scroll in a ScrollArea whose viewport has `tabindex="-1"`: in Chromium and Firefox a scrolling list is otherwise a Tab stop, and Tab from the open list lands on it instead of the next control. If you compose `popupListClasses` over Origami's Content yourself, render `<div foldScrollArea [viewportTabIndex]="-1" class="-m-1 min-h-0"><div class="p-1">…options…</div></div>` inside it. Popover's scroller takes your `tabindex`, because its panel can hold text the keyboard needs to reach; see its [keyboard and scrolling](#popover) note.
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
- No multiple files, upload progress or previews in FileField.
- No scrolling or wrapping Tabs List, sliding underline or link tabs.
- No arrow, Home or End keys between Accordion triggers (Origami's contract), and no ready-made disclosure row or built-in indicator on CollapsibleTrigger. Before hydration, closed panels are plain `hidden`, so find-in-page and fragments can't open them yet; constraint validation doesn't open a closed section (see [Forms](#accordion)); Safari's Find, and Firefox's from 139 to 147, can open an item without scrolling to the match; and focus can drop to the page when Tab enters a closing panel.
- No Tooltip shorthand attribute, close delay or arrows; no PopoverAnchor, PopoverClose, title or description parts, and no open look on PopoverTrigger. Near the viewport's edge, Origami flips a Tooltip's or Popover's alignment or slides it along the edge to keep it in view; it overflows only along its main axis, when neither side of its Trigger has room.
- No context menu, menubar, mixed checkbox item or disabled MenuLink (use a disabled MenuItem), and no keep-open on Enter for checkbox and radio items: that's Origami's contract. In a narrow viewport, a submenu that fits on neither side of its parent, such as a 200px submenu at 390px, overflows the viewport's edge.
- No replacing or deduplicating a toast by id, hotkey, promise or loading toasts, swipe, or placement other than the bottom corners. Outside Chromium, the deck's heights snap instead of animating (no `interpolate-size`; the offsets and scale still animate), and when the front toast closes, the next one snaps to its full height once the exit ends.
- No ScrollArea hide-delay input, corner, scroll shadows or `cdkScrollable`; its root's layout is fold's. No Avatar groups, "+N" or initials helper; a class-sized avatar doesn't pick its radius from its size. No Progress label or value part, buffer, segments, vertical bar or animated value; the unknown sweep runs left to right in right-to-left text. Avatar's delay and Progress's sweep override only with an important utility.
- No Meter label or value part on the bar, vertical bar, animated value, chart integration or region announcements. Regions are visual only, computed in fold from native `<meter>`'s rules.
- No table caption, row header, footer or totals styling, sticky header, row selection, clickable rows, `align="center"`, or sorting and paging behavior, which the view owns; no data grid. No Badge sizes, dot, solid style or icon-only badge. No Page breadcrumbs, back link or tabs, and no Empty icon.
- A Tooltip inside a Popover stays visible through the Popover's closing animation, about 120ms, and hides when the Popover does.
- One month at a time in a Calendar: no two months side by side (Origami proposal `03a47789`), week numbers (`3428bbc6`), presets (`6f9f9519`) or month and year dropdowns (the heading's drill-down only). The months and years views have three columns. Custom cell content, such as prices or event dots, means editing your copy of `calendar-grid.ts`, which `add --existing overwrite` replaces.
- One month in a range or multiple picker's popup: no two months side by side (`03a47789`), so chosen days in other months need navigating. No typed range entry or range field shape (Origami proposal `b5089365`), week numbers (`3428bbc6`) or presets (`6f9f9519`). No time chosen in the date picker's popup and no button-shaped DateTimePicker (`55f79d26`). The multiple, range and month pickers have no field shape, `locale` or `clear()`, and no Close part (write `open`). No clear button (call `clear()`). A click on a date field's empty end or a separator focuses no segment, and the field-shape popup is anchored to its icon button.
- In Firefox's forced-colors mode, focus rings are `CanvasText`, the text color, rather than Chromium's `Highlight`: fold leaves the ring's forced color to the browser on its Button-based parts (buttons, triggers, toggles and segments), except a pressed Toggle, ToolbarToggle or ToggleGroupItem, whose ring is `CanvasText` in every browser. The Slider thumb's ring is always `CanvasText`, and a radio draws its ring on its dot.
- No Toolbar-wide size or disabled state: set them per control. Icon-only toggles and toolbar buttons are 32px squares only, the segmented control has one size, and a group wider than its Toolbar overflows it.

## Developing this package

`components/` holds the component sources the schematics copy, authored with the placeholder prefix `fold__` (`fold__Button`), which `add` replaces with yours. `schematics/` holds `ng-add` and `add`.

```sh
pnpm --filter @loozo/fold-ui test           # typecheck schematics and components, build, schematic tests
pnpm --filter @loozo/fold-ui test:consumer  # ng new → ng add → add → production build → Chromium smoke → scrolling suite
```

`test:consumer` needs network access for the app's `npm install`, and runs its build and browser steps under Origami's machine-wide gate lock. After the Chromium smoke it runs the scrolling suite, `tests/consumer-scrolling.mjs`, in Chromium, Firefox and WebKit; WebKit launches through Origami's `webkitLaunchOptions`, so set `ORIGAMI_WEBKIT_DEPS_ROOT` locally where Playwright's WebKit lacks its system libraries.
