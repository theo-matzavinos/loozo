// The root component of the consumer check's app (consumer.mjs), using the components `add`
// copied with the prefix `zz`. consumer-smoke.mjs reads its ids.
import { Component, inject, signal } from "@angular/core";
import {
  FormField,
  disabled,
  email,
  form,
  max,
  min,
  readonly,
  required,
  submit,
  validate,
} from "@angular/forms/signals";
import { OrigamiDialog, injectOrigamiDialogOpener } from "@loozo/origami-ui/dialog";
import { AlertDialogParts } from "#ui/alert-dialog";
import { Button, ButtonLink } from "#ui/button";
import { Checkbox } from "#ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogParts,
  DialogTitle,
} from "#ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { Input } from "#ui/input";
import { NumberFieldParts } from "#ui/number-field";
import { RadioGroup, RadioGroupItem } from "#ui/radio-group";
import { SheetParts } from "#ui/sheet";
import { Slider, SliderThumb } from "#ui/slider";
import { Switch } from "#ui/switch";
import { Textarea } from "#ui/textarea";
import { LucideTriangleAlert } from "@lucide/angular";

// A dialog opened from code: the component is the Dialog root and closes itself.
@Component({
  selector: "app-search-dialog",
  imports: [Button, DialogContent, DialogFooter, DialogHeader, DialogTitle],
  hostDirectives: [Dialog],
  template: `
    <dialog zzDialogContent id="search-content" class="w-[min(640px,calc(100%-32px))]">
      <div zzDialogHeader>
        <h2 zzDialogTitle>Search invoices</h2>
      </div>
      <div zzDialogFooter>
        <button zzButton variant="primary" (click)="done()" id="search-done">Search</button>
      </div>
    </dialog>
  `,
})
export class SearchDialog {
  readonly #dialog = inject(OrigamiDialog);

  protected done(): void {
    this.#dialog.open.set(false);
  }
}

@Component({
  selector: "app-root",
  imports: [
    Button,
    ButtonLink,
    AlertDialogParts,
    Checkbox,
    DialogParts,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FormField,
    Input,
    LucideTriangleAlert,
    NumberFieldParts,
    RadioGroup,
    RadioGroupItem,
    SheetParts,
    Slider,
    SliderThumb,
    Switch,
    Textarea,
  ],
  template: `
    <main class="flex flex-wrap items-center gap-2 p-5">
      <button zzButton variant="primary" size="sm" id="sm">Small</button>
      <button zzButton variant="primary" id="md">Save</button>
      <button zzButton variant="primary" size="lg" id="lg">Large</button>
      <button zzButton variant="ghost" size="icon" aria-label="Alert" id="icon">
        <svg lucideTriangleAlert></svg>
      </button>
      <button zzButton disabled id="disabled">Disabled</button>
      <button zzButton variant="destructive" size="sm" id="destructive-sm">Small</button>
      <button zzButton variant="destructive" id="destructive-md">Delete</button>
      <button zzButton variant="destructive" size="lg" id="destructive-lg">Large</button>
      <button zzButton class="px-6" id="merged">Merged</button>
      <button zzButton class="rounded-checkbox" id="merged-radius">Merged radius</button>
      <button zzButton variant="primary" class="text-label" id="merged-text">Merged text</button>
      <a zzButton variant="link" href="/contracts" id="link">Contracts</a>
      <a zzButton variant="link" size="sm" href="/contracts" id="link-sm">Contracts</a>
      <a zzButton variant="link" size="lg" href="/contracts" id="link-lg">Contracts</a>
      <a zzButton variant="primary" href="/contracts/new" id="anchor">New contract</a>
      <p class="text-title" id="title-text">
        Contracts <span class="text-body" id="body-in-title">12 active</span>
      </p>
      <output id="terminations">{{ terminations() }}</output>

      <div zzAlertDialog [(open)]="open" [dismissible]="!pending()">
        <button zzAlertDialogTrigger variant="destructive" id="trigger">Terminate contract</button>
        <dialog zzAlertDialogContent id="content">
          <div zzAlertDialogHeader id="header">
            <div zzAlertDialogIcon><svg lucideTriangleAlert></svg></div>
            <h2 zzAlertDialogTitle id="title">Terminate contract LC-2041?</h2>
            <p zzAlertDialogDescription id="description">
              The final invoice is issued today. This can't be undone.
            </p>
          </div>
          <div zzAlertDialogFooter>
            <button zzAlertDialogCancel [disabled]="pending()" focusableWhenDisabled id="cancel">
              Cancel
            </button>
            <button
              zzButton
              variant="destructive"
              [disabled]="pending()"
              focusableWhenDisabled
              (click)="terminate()"
              id="action"
            >
              Terminate contract
            </button>
          </div>
        </dialog>
      </div>

      <div zzDialog [(open)]="editOpen" [dismissible]="!editPending()">
        <button zzDialogTrigger id="dialog-trigger">Edit contract</button>
        <dialog zzDialogContent id="dialog-content">
          <form class="contents" (submit)="saveContract($event)">
            <div zzDialogHeader>
              <h2 zzDialogTitle id="dialog-title">Edit contract</h2>
              <p zzDialogDescription>Changes apply from the next billing period.</p>
            </div>
            <div zzDialogBody class="grid gap-4">
              <div zzField>
                <label zzFieldLabel>Reference</label>
                <input zzInput autofocus [readOnly]="editPending()" id="dialog-reference" />
              </div>
            </div>
            <div zzDialogFooter>
              <button
                zzDialogClose
                [disabled]="editPending()"
                focusableWhenDisabled
                id="dialog-cancel"
              >
                Cancel
              </button>
              <button
                zzButton
                variant="primary"
                type="submit"
                [disabled]="editPending()"
                focusableWhenDisabled
                id="dialog-save"
              >
                Save
              </button>
            </div>
          </form>
        </dialog>
      </div>
      <output id="contract-saves">{{ contractSaves() }}</output>
      <button zzButton (click)="openSearch()" id="search-open">Search invoices</button>

      <!-- The root on the <dialog> itself. -->
      <button zzButton (click)="noteOpen.set(true)" id="note-open">Add note</button>
      <dialog zzDialog zzDialogContent [(open)]="noteOpen" id="note-content">
        <div zzDialogHeader>
          <h2 zzDialogTitle>Add note</h2>
        </div>
      </dialog>
      <button zzButton (click)="discardOpen.set(true)" id="discard-open">Discard draft</button>
      <dialog zzAlertDialog zzAlertDialogContent [(open)]="discardOpen" id="discard-content">
        <div zzAlertDialogHeader>
          <h2 zzAlertDialogTitle>Discard draft?</h2>
        </div>
        <div zzAlertDialogFooter>
          <button zzAlertDialogCancel>Keep editing</button>
        </div>
      </dialog>

      <div zzSheet [(open)]="filtersOpen" [dismissible]="!filtersPending()">
        <button zzSheetTrigger id="sheet-trigger">Filters</button>
        <dialog zzSheetContent id="sheet-content">
          <form class="contents" (submit)="applyFilters($event)">
            <div zzSheetHeader>
              <h2 zzSheetTitle id="sheet-title">Filters</h2>
              <p zzSheetDescription>12 contracts match.</p>
            </div>
            <div zzSheetBody class="grid gap-4">
              <div zzField>
                <label zzFieldLabel>Status</label>
                <input zzInput [readOnly]="filtersPending()" />
              </div>
              <div zzField>
                <label zzFieldLabel>Search</label>
                <input zzInput autofocus [readOnly]="filtersPending()" id="sheet-search" />
              </div>
            </div>
            <div zzSheetFooter>
              <button
                zzButton
                variant="primary"
                type="submit"
                [disabled]="filtersPending()"
                focusableWhenDisabled
              >
                Apply
              </button>
            </div>
          </form>
        </dialog>
      </div>
      <output id="filter-applies">{{ filterApplies() }}</output>

      <div zzSheet [(open)]="navOpen">
        <button zzSheetTrigger variant="ghost" id="nav-trigger">Menu</button>
        <dialog
          zzSheetContent
          side="left"
          [closeButton]="false"
          class="w-72 gap-0 p-0"
          id="nav-content"
        >
          <div zzSheetHeader class="sr-only"><h2 zzSheetTitle>Navigation</h2></div>
          <nav class="flex min-h-0 flex-col gap-0.5 overflow-y-auto p-2">
            <a
              href="/contracts"
              (click)="$event.preventDefault(); navOpen.set(false)"
              id="nav-link"
            >
              Contracts
            </a>
          </nav>
        </dialog>
      </div>

      <!-- The Sheet root on the <dialog> itself. -->
      <button zzButton (click)="panelOpen.set(true)" id="panel-open">Show details</button>
      <dialog zzSheet zzSheetContent [(open)]="panelOpen" id="panel-content">
        <div zzSheetHeader>
          <h2 zzSheetTitle>Details</h2>
        </div>
      </dialog>
    </main>

    <section class="grid w-80 gap-4 p-5">
      <div zzField #emailField="zzField" id="email-field">
        <label zzFieldLabel id="email-label">Email</label>
        <input
          zzInput
          type="email"
          [formField]="contact.email"
          placeholder="you@example.com"
          id="email"
        />
        <p zzFieldDescription id="email-description">We only use it for receipts.</p>
        @if (emailField.state.errorsShown()) {
          <p zzFieldError id="email-error">{{ emailField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzField>
        <label zzFieldLabel>Notes</label>
        <textarea zzTextarea rows="4" [formField]="contact.notes" id="notes"></textarea>
      </div>
      <div zzField id="account-field">
        <label zzFieldLabel id="account-label">Account</label>
        <input zzInput [formField]="contact.account" id="account" />
      </div>
      <input zzInput readonly value="LC-2041" aria-label="Contract" id="contract" />
      <input zzInput type="search" aria-label="Search" class="w-60 ps-8" id="search" />
      <div class="light">
        <input zzInput aria-label="Reference" id="light-input" />
      </div>
      <button zzButton variant="primary" (click)="save()" id="save">Save</button>
      <output id="saves">{{ saves() }}</output>
    </section>

    <!-- Checkbox, Switch and RadioGroup: one control per Field, since a Field takes one control. -->
    <form class="grid w-96 gap-4 p-5" (submit)="saveControls($event)">
      <div zzField orientation="horizontal" #termsField="zzField" id="terms-field">
        <button zzCheckbox [formField]="controls.terms" id="terms"></button>
        <label zzFieldLabel id="terms-label">Accept the leasing terms</label>
        @if (termsField.state.errorsShown()) {
          <p zzFieldError>{{ termsField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzField orientation="horizontal" id="vat-field">
        <button zzCheckbox [formField]="controls.vat" id="vat"></button>
        <label zzFieldLabel>Include VAT</label>
      </div>
      <div zzField orientation="horizontal" id="renew-field">
        <button zzSwitch [formField]="controls.renew" id="renew"></button>
        <label zzFieldLabel id="renew-label">Renew automatically</label>
        <p zzFieldDescription id="renew-description">Renews 30 days before the end date.</p>
      </div>
      <div zzField orientation="horizontal" id="locked-field">
        <button zzSwitch [formField]="controls.locked" id="locked"></button>
        <label zzFieldLabel>Locked</label>
      </div>
      <div zzField orientation="horizontal" id="frozen-field">
        <button zzSwitch [formField]="controls.frozen" id="frozen"></button>
        <label zzFieldLabel>Frozen</label>
      </div>

      <div zzField #cycleField="zzField" id="cycle-field">
        <span zzFieldLabel id="cycle-label">Billing cycle</span>
        <div zzRadioGroup [formField]="controls.cycle" id="cycle">
          @for (option of cycles; track option.value) {
            <button
              zzRadioGroupItem
              [value]="option.value"
              [disabled]="option.locked"
              [attr.id]="'cycle-' + option.value"
            >
              {{ option.label }}
            </button>
          }
        </div>
        @if (cycleField.state.errorsShown()) {
          <p zzFieldError>{{ cycleField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button zzButton (click)="controls.cycle().focusBoundControl()" id="focus-cycle">
        Focus billing cycle
      </button>

      <div zzField #bandField="zzField" id="band-field">
        <span zzFieldLabel id="band-label">Band</span>
        <div zzRadioGroup [formField]="controls.band" id="band">
          <button zzRadioGroupItem value="a" id="band-a">A</button>
          <button zzRadioGroupItem value="b" id="band-b">B</button>
        </div>
        @if (bandField.state.errorsShown()) {
          <p zzFieldError>{{ bandField.state.errors()[0]?.message }}</p>
        }
      </div>

      <!-- A valid inner group inside an invalid outer one keeps its own look. -->
      <div zzField id="plan-field">
        <span zzFieldLabel id="plan-label">Plan</span>
        <div zzRadioGroup [formField]="controls.plan" id="plan">
          <button zzRadioGroupItem value="basic" id="plan-basic">Basic</button>
          <button zzRadioGroupItem value="pro" id="plan-pro">Pro</button>
          <div class="ps-6">
            <div zzField id="addon-field">
              <span zzFieldLabel id="addon-label">Add-on</span>
              <div zzRadioGroup [formField]="controls.addon" id="addon">
                <button zzRadioGroupItem value="none" id="addon-none">None</button>
                <button zzRadioGroupItem value="support" id="addon-support">Support</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- An editable inner group inside a readonly outer one keeps its own look. -->
      <div zzField id="tier-field">
        <span zzFieldLabel id="tier-label">Tier</span>
        <div zzRadioGroup [formField]="controls.tier" id="tier">
          <button zzRadioGroupItem value="standard" id="tier-standard">Standard</button>
          <button zzRadioGroupItem value="priority" id="tier-priority">Priority</button>
          <div zzField class="ps-6" id="tier-addon-field">
            <span zzFieldLabel id="tier-addon-label">Tier add-on</span>
            <div zzRadioGroup [(value)]="tierAddon" id="tier-addon">
              <button zzRadioGroupItem value="a" id="tier-addon-a">A</button>
              <button zzRadioGroupItem value="b" id="tier-addon-b">B</button>
            </div>
            <output id="tier-addon-value">{{ tierAddon() }}</output>
          </div>
        </div>
      </div>

      <!-- A checked or on value can be the invalid one. -->
      <div zzField orientation="horizontal" #waiveField="zzField" id="waive-field">
        <button zzCheckbox [formField]="controls.waive" id="waive"></button>
        <label zzFieldLabel>Waive the insurance</label>
        @if (waiveField.state.errorsShown()) {
          <p zzFieldError>{{ waiveField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzField orientation="horizontal" #pauseField="zzField" id="pause-field">
        <button zzSwitch [formField]="controls.pause" id="pause"></button>
        <label zzFieldLabel>Pause billing</label>
        @if (pauseField.state.errorsShown()) {
          <p zzFieldError>{{ pauseField.state.errors()[0]?.message }}</p>
        }
      </div>

      <div class="flex items-center gap-2">
        <button zzCheckbox aria-label="Select LC-2041" [(checked)]="selected" id="select-row"></button>
        <output id="selected">{{ selected() }}</output>
      </div>
      <div zzRadioGroup aria-label="Density" [(value)]="density" class="flex-row gap-4" id="density">
        <button zzRadioGroupItem value="compact">Compact</button>
        <button zzRadioGroupItem value="comfortable">Comfortable</button>
      </div>
      <div class="flex items-center gap-2">
        <button zzCheckbox aria-label="Merged checkbox" class="rounded-full" id="merged-checkbox"></button>
        <button zzSwitch aria-label="Merged switch" class="w-10" id="merged-switch"></button>
      </div>
      <div class="light flex items-center gap-2 bg-background p-2">
        <button zzCheckbox aria-label="Light checkbox" [checked]="true" id="light-checkbox"></button>
        <button zzSwitch aria-label="Light switch" [checked]="true" id="light-switch"></button>
      </div>

      <button zzButton variant="primary" type="submit" id="ctl-save">Save controls</button>
      <output id="control-saves">{{ controlSaves() }}</output>
    </form>

    <!-- Number field and Slider: one control per Field. -->
    <form id="numbers" class="grid w-[410px] gap-4 p-5" (submit)="saveNumbers($event)">
      <input zzInput aria-label="Plain amount" value="1.234,50" id="plain-input" />
      <div
        zzNumberField
        [locale]="'el-GR'"
        minimumFractionDigits="2"
        maximumFractionDigits="2"
        [(value)]="bareAmount"
        id="amount-bare"
      >
        <input zzNumberFieldInput aria-label="Bare amount" id="amount-bare-input" />
      </div>

      <div zzField #amountField="zzField" id="amount-field">
        <label zzFieldLabel id="amount-label">Amount (€)</label>
        <div
          zzNumberField
          [formField]="numbers.amount"
          [locale]="'el-GR'"
          minimumFractionDigits="2"
          maximumFractionDigits="2"
          id="amount"
        >
          <button zzNumberFieldDecrement aria-label="Decrease amount" id="amount-dec"></button>
          <span zzNumberFieldAdornment id="amount-sign">€</span>
          <input zzNumberFieldInput placeholder="0,00" id="amount-input" />
          <button zzNumberFieldIncrement aria-label="Increase amount" id="amount-inc"></button>
        </div>
        <p zzFieldDescription>The deposit, in euros.</p>
        @if (amountField.state.errorsShown()) {
          @switch (amountField.state.errors()[0]?.kind) {
            @case ("numberInvalid") {
              <p zzFieldError>That isn't an amount</p>
            }
            @case ("numberIncomplete") {
              <p zzFieldError>Finish the amount</p>
            }
            @default {
              <p zzFieldError>{{ amountField.state.errors()[0]?.message }}</p>
            }
          }
        }
        <output id="amount-value">{{ numbers.amount().value() }}</output>
      </div>

      <div zzField id="tickets-field">
        <label zzFieldLabel>Tickets</label>
        <div zzNumberField [formField]="numbers.tickets" maximumFractionDigits="0" id="tickets">
          <button zzNumberFieldDecrement aria-label="Fewer tickets" id="tickets-dec"></button>
          <input zzNumberFieldInput id="tickets-input" />
          <button zzNumberFieldIncrement aria-label="More tickets" id="tickets-inc"></button>
        </div>
      </div>
      <div zzField id="share-field">
        <label zzFieldLabel>Share (%)</label>
        <div zzNumberField [formField]="numbers.share" id="share">
          <input zzNumberFieldInput id="share-input" />
          <span zzNumberFieldAdornment id="share-sign">%</span>
        </div>
      </div>
      <div zzField id="pair-field">
        <label zzFieldLabel>Seats</label>
        <div zzNumberField [formField]="numbers.seats" maximumFractionDigits="0" id="pair">
          <input zzNumberFieldInput id="pair-input" />
          <button zzNumberFieldDecrement aria-label="Fewer seats"></button>
          <button zzNumberFieldIncrement aria-label="More seats"></button>
        </div>
      </div>
      <div zzField id="locked-amount-field">
        <label zzFieldLabel>Locked amount (€)</label>
        <div
          zzNumberField
          [formField]="numbers.lockedAmount"
          [locale]="'el-GR'"
          minimumFractionDigits="2"
          maximumFractionDigits="2"
          id="locked-amount"
        >
          <button
            zzNumberFieldDecrement
            aria-label="Decrease locked amount"
            id="locked-amount-dec"
          ></button>
          <input zzNumberFieldInput id="locked-amount-input" />
          <button
            zzNumberFieldIncrement
            aria-label="Increase locked amount"
            id="locked-amount-inc"
          ></button>
        </div>
      </div>
      <div zzField id="frozen-amount-field">
        <label zzFieldLabel>Frozen amount (€)</label>
        <div
          zzNumberField
          [formField]="numbers.frozenAmount"
          [locale]="'el-GR'"
          minimumFractionDigits="2"
          maximumFractionDigits="2"
          id="frozen-amount"
        >
          <button
            zzNumberFieldDecrement
            aria-label="Decrease frozen amount"
            id="frozen-amount-dec"
          ></button>
          <input zzNumberFieldInput id="frozen-amount-input" />
          <button
            zzNumberFieldIncrement
            aria-label="Increase frozen amount"
            id="frozen-amount-inc"
          ></button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div zzNumberField [(value)]="quantity" min="1" maximumFractionDigits="0" id="quantity">
          <button zzNumberFieldDecrement aria-label="Fewer" id="quantity-dec"></button>
          <input zzNumberFieldInput aria-label="Quantity" id="quantity-input" />
          <button zzNumberFieldIncrement aria-label="More" id="quantity-inc"></button>
        </div>
        <output id="quantity-value">{{ quantity() }}</output>
      </div>
      <div zzNumberField [value]="8" class="h-7" id="amount-sm">
        <button zzNumberFieldDecrement aria-label="Decrease small" id="amount-sm-dec"></button>
        <input zzNumberFieldInput aria-label="Small" />
        <button zzNumberFieldIncrement aria-label="Increase small" id="amount-sm-inc"></button>
      </div>
      <div zzNumberField [value]="8" class="h-9" id="amount-lg">
        <button zzNumberFieldDecrement aria-label="Decrease large" id="amount-lg-dec"></button>
        <input zzNumberFieldInput aria-label="Large" />
        <button zzNumberFieldIncrement aria-label="Increase large" id="amount-lg-inc"></button>
      </div>

      <div zzField id="zoom-field">
        <div class="flex items-baseline justify-between">
          <span zzFieldLabel id="zoom-label">Zoom</span>
          <output class="tabular-nums" id="zoom-value">{{ numbers.zoom().value() }}%</output>
        </div>
        <div zzSlider [formField]="numbers.zoom" step="10" id="zoom">
          <div
            zzSliderThumb
            [attr.aria-valuetext]="numbers.zoom().value() + '%'"
            id="zoom-thumb"
          ></div>
        </div>
        <p zzFieldDescription id="zoom-description">Scales the org chart.</p>
      </div>
      <div zzField id="zoom-locked-field">
        <span zzFieldLabel>Locked zoom</span>
        <div zzSlider [formField]="numbers.zoomLocked" id="zoom-locked">
          <div zzSliderThumb id="zoom-locked-thumb"></div>
        </div>
      </div>
      <div zzField id="zoom-frozen-field">
        <span zzFieldLabel>Frozen zoom</span>
        <div zzSlider [formField]="numbers.zoomFrozen" id="zoom-frozen">
          <div zzSliderThumb id="zoom-frozen-thumb"></div>
        </div>
      </div>
      <div zzField #zoomInvalidField="zzField" id="zoom-invalid-field">
        <span zzFieldLabel>Contrast</span>
        <div zzSlider [formField]="numbers.zoomInvalid" id="zoom-invalid">
          <div zzSliderThumb id="zoom-invalid-thumb"></div>
        </div>
        @if (zoomInvalidField.state.errorsShown()) {
          <p zzFieldError>{{ zoomInvalidField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div dir="rtl">
        <div zzSlider [(value)]="rtlZoom" id="zoom-rtl">
          <div zzSliderThumb aria-label="Right-to-left zoom" id="zoom-rtl-thumb"></div>
        </div>
      </div>
      <div class="grid gap-2" id="zoom-ends">
        <div zzSlider [value]="0" id="zoom-at-min">
          <div zzSliderThumb aria-label="Lowest zoom"></div>
        </div>
        <div zzSlider [value]="100" id="zoom-at-max">
          <div zzSliderThumb aria-label="Highest zoom"></div>
        </div>
      </div>
      <div class="light grid gap-4 bg-background p-2">
        <div zzNumberField [value]="1234.5" [locale]="'el-GR'" id="light-amount">
          <span zzNumberFieldAdornment>€</span>
          <input zzNumberFieldInput aria-label="Light amount" />
        </div>
        <div zzSlider [value]="50" id="light-zoom">
          <div zzSliderThumb aria-label="Light zoom" id="light-zoom-thumb"></div>
        </div>
      </div>

      <div class="flex gap-2">
        <button zzButton variant="primary" type="submit" id="numbers-save">Save numbers</button>
        <button
          zzButton
          type="button"
          (click)="numbers.amount().focusBoundControl()"
          id="focus-amount"
        >
          Focus amount
        </button>
        <button zzButton type="button" (click)="numbers.zoom().focusBoundControl()" id="focus-zoom">
          Focus zoom
        </button>
      </div>
      <output id="number-saves">{{ numberSaves() }}</output>
    </form>
  `,
})
export class App {
  protected readonly open = signal(false);
  protected readonly pending = signal(false);
  protected readonly terminations = signal(0);
  protected readonly saves = signal(0);
  protected readonly editOpen = signal(false);
  protected readonly editPending = signal(false);
  protected readonly contractSaves = signal(0);
  protected readonly noteOpen = signal(false);
  protected readonly discardOpen = signal(false);
  protected readonly filtersOpen = signal(false);
  protected readonly filtersPending = signal(false);
  protected readonly filterApplies = signal(0);
  protected readonly navOpen = signal(false);
  protected readonly panelOpen = signal(false);
  protected readonly selected = signal(false);
  protected readonly density = signal<string | null>("compact");
  protected readonly tierAddon = signal<string | null>("a");
  protected readonly controlSaves = signal(0);
  protected readonly bareAmount = signal<number | null>(1234.5);
  protected readonly quantity = signal<number | null>(3);
  protected readonly rtlZoom = signal(25);
  protected readonly numberSaves = signal(0);
  protected readonly cycles = [
    { value: "monthly", label: "Monthly", locked: false },
    { value: "weekly", label: "Weekly", locked: true },
    { value: "quarterly", label: "Quarterly", locked: false },
    { value: "yearly", label: "Yearly", locked: false },
  ];
  readonly #search = injectOrigamiDialogOpener(SearchDialog);
  protected readonly contact = form(
    signal({ email: "", notes: "", account: "ACC-0042" }),
    (path) => {
      required(path.email, { message: "Enter your email." });
      email(path.email, { message: "Enter a valid email." });
      disabled(path.account);
    },
  );

  protected readonly controls = form(
    signal({
      terms: false,
      vat: true,
      renew: false,
      locked: false,
      frozen: true,
      cycle: null as string | null,
      band: "b" as string | null,
      plan: null as string | null,
      addon: "none" as string | null,
      tier: "standard" as string | null,
      waive: true,
      pause: true,
    }),
    (path) => {
      required(path.terms, { message: "Accept the terms to continue." });
      disabled(path.locked);
      readonly(path.frozen);
      required(path.cycle, { message: "Choose a billing cycle." });
      validate(path.band, ({ value }) =>
        value() === "b" ? { kind: "band", message: "Band B is full." } : undefined,
      );
      required(path.plan, { message: "Choose a plan." });
      readonly(path.tier);
      validate(path.waive, ({ value }) =>
        value() ? { kind: "insurance", message: "Leases need insurance." } : undefined,
      );
      validate(path.pause, ({ value }) =>
        value() ? { kind: "pause", message: "Billing can't pause in the first term." } : undefined,
      );
    },
  );

  // Every rule has a message: a rule without one gives an error whose message is undefined.
  protected readonly numbers = form(
    signal({
      amount: null as number | null,
      tickets: 10 as number | null,
      share: 25 as number | null,
      seats: 2 as number | null,
      lockedAmount: 1234.5 as number | null,
      frozenAmount: 1234.5 as number | null,
      zoom: 100,
      zoomLocked: 50,
      zoomFrozen: 50,
      zoomInvalid: 30,
    }),
    (path) => {
      required(path.amount, { message: "Enter an amount" });
      min(path.amount, 0, { message: "It can't be negative" });
      max(path.amount, 1000, { message: "Up to 1.000 €" });
      min(path.tickets, 1, { message: "At least one ticket" });
      max(path.tickets, 10, { message: "Up to 10 tickets" });
      max(path.share, 100, { message: "Up to 100%" });
      disabled(path.lockedAmount);
      readonly(path.frozenAmount);
      min(path.zoom, 20, { message: "At least 20%" });
      max(path.zoom, 180, { message: "Up to 180%" });
      disabled(path.zoomLocked);
      readonly(path.zoomFrozen);
      validate(path.zoomInvalid, ({ value }) => {
        if (value() < 50) {
          return { kind: "contrast", message: "Choose at least 50." };
        }

        return undefined;
      });
    },
  );

  protected async saveNumbers(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.numbers, async () => {
      this.numberSaves.update((count) => count + 1);

      return undefined;
    });
  }

  protected async saveControls(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.controls, async () => {
      this.controlSaves.update((count) => count + 1);

      return undefined;
    });
  }

  protected async save(): Promise<void> {
    await submit(this.contact, async () => {
      this.saves.update((count) => count + 1);

      return undefined;
    });
  }

  protected saveContract(event: Event): void {
    event.preventDefault();

    // A focusable disabled submit button still submits, and so does Enter in a field.
    if (this.editPending()) {
      return;
    }

    this.contractSaves.update((count) => count + 1);
    this.editPending.set(true);
    setTimeout(() => {
      this.editPending.set(false);
      this.editOpen.set(false);
    }, 600);
  }

  protected applyFilters(event: Event): void {
    event.preventDefault();

    if (this.filtersPending()) {
      return;
    }

    this.filterApplies.update((count) => count + 1);
    this.filtersPending.set(true);
    setTimeout(() => {
      this.filtersPending.set(false);
      this.filtersOpen.set(false);
    }, 600);
  }

  protected openSearch(): void {
    this.#search.open();
  }

  protected terminate(): void {
    // A focusable disabled button still dispatches clicks.
    if (this.pending()) {
      return;
    }

    this.terminations.update((count) => count + 1);
    this.pending.set(true);
    setTimeout(() => {
      this.pending.set(false);
      this.open.set(false);
    }, 600);
  }
}
