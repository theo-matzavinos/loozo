// The root component of the consumer check's app (consumer.mjs), using the components `add`
// copied with the prefix `zz`. consumer-smoke.mjs reads its ids.
import { Component, LOCALE_ID, computed, inject, signal } from "@angular/core";
import {
  FormField,
  disabled,
  email,
  form,
  max,
  min,
  pattern,
  readonly,
  required,
  submit,
  validate,
} from "@angular/forms/signals";
import { OrigamiDialog, injectOrigamiDialogOpener } from "@loozo/origami-ui/dialog";
import { AlertDialogParts } from "#ui/alert-dialog";
import { AvatarParts } from "#ui/avatar";
import { Button, ButtonLink } from "#ui/button";
import { Checkbox } from "#ui/checkbox";
import { ComboboxParts } from "#ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogParts,
  DialogTitle,
} from "#ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { FileFieldParts } from "#ui/file-field";
import { Input } from "#ui/input";
import { MenuParts } from "#ui/menu";
import { NumberFieldParts } from "#ui/number-field";
import { OtpField, OtpFieldInput } from "#ui/otp-field";
import { PopoverParts } from "#ui/popover";
import { Progress } from "#ui/progress";
import { RadioGroup, RadioGroupItem } from "#ui/radio-group";
import { ScrollArea } from "#ui/scroll-area";
import { SelectParts } from "#ui/select";
import { SheetParts } from "#ui/sheet";
import { Slider, SliderThumb } from "#ui/slider";
import { Switch } from "#ui/switch";
import { TabsParts } from "#ui/tabs";
import { Textarea } from "#ui/textarea";
import { TooltipParts } from "#ui/tooltip";
import {
  LucideArchive,
  LucideChevronDown,
  LucideEllipsis,
  LucideLink,
  LucidePencil,
  LucideRotateCcw,
  LucideStore,
  LucideTrash,
  LucideTriangleAlert,
  LucideUpload,
} from "@lucide/angular";

const PLANETS = [
  { id: 1, name: "Mercury", dwarf: false },
  { id: 2, name: "Venus", dwarf: false },
  { id: 3, name: "Earth", dwarf: false },
  { id: 4, name: "Mars", dwarf: false },
  { id: 5, name: "Jupiter", dwarf: false },
  { id: 6, name: "Saturn", dwarf: false },
  { id: 7, name: "Uranus", dwarf: false },
  { id: 8, name: "Neptune", dwarf: false },
  { id: 9, name: "Pluto", dwarf: true },
];

const CUSTOMERS = [
  { id: 1, name: "Ada Lovelace", email: "ada@example.com", archived: false },
  { id: 2, name: "Grace Hopper", email: "grace@example.com", archived: false },
  { id: 3, name: "Alan Turing", email: "alan@example.com", archived: true },
];

// 40 countries: enough for the list to scroll, few enough to keep the bundle near its budget.
const COUNTRIES = [
  { code: "AL", name: "Albania" },
  { code: "AD", name: "Andorra" },
  { code: "AT", name: "Austria" },
  { code: "BE", name: "Belgium" },
  { code: "BA", name: "Bosnia and Herzegovina" },
  { code: "BG", name: "Bulgaria" },
  { code: "HR", name: "Croatia" },
  { code: "CY", name: "Cyprus" },
  { code: "CZ", name: "Czechia" },
  { code: "DK", name: "Denmark" },
  { code: "EE", name: "Estonia" },
  { code: "FI", name: "Finland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "GR", name: "Greece" },
  { code: "HU", name: "Hungary" },
  { code: "IS", name: "Iceland" },
  { code: "IE", name: "Ireland" },
  { code: "IT", name: "Italy" },
  { code: "LV", name: "Latvia" },
  { code: "LI", name: "Liechtenstein" },
  { code: "LT", name: "Lithuania" },
  { code: "LU", name: "Luxembourg" },
  { code: "MT", name: "Malta" },
  { code: "MD", name: "Moldova" },
  { code: "MC", name: "Monaco" },
  { code: "ME", name: "Montenegro" },
  { code: "NL", name: "Netherlands" },
  { code: "MK", name: "North Macedonia" },
  { code: "NO", name: "Norway" },
  { code: "PL", name: "Poland" },
  { code: "PT", name: "Portugal" },
  { code: "RO", name: "Romania" },
  { code: "SM", name: "San Marino" },
  { code: "RS", name: "Serbia" },
  { code: "SK", name: "Slovakia" },
  { code: "SI", name: "Slovenia" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "CH", name: "Switzerland" },
];

// OTP field: a verification code in a Field, a masked PIN, disabled, readonly, larger cells, an
// RTL parent and the light theme.
@Component({
  selector: "app-otp-fields",
  imports: [
    Button,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FormField,
    OtpField,
    OtpFieldInput,
  ],
  template: `
    <form id="otps" class="grid w-[380px] gap-4 p-5" (submit)="save($event)">
      <div zzField #codeField="zzField" id="otp-field-wrap">
        <label zzFieldLabel id="otp-label">Verification code</label>
        <div
          zzOtpField
          #otp="zzOtpField"
          [formField]="codes.code"
          (valueChange)="otp.state.complete() && verified.set($event)"
          id="otp"
        >
          <input zzOtpFieldInput id="otp-input" />
        </div>
        <p zzFieldDescription id="otp-description">The 6-digit code we sent you</p>
        @if (codeField.state.errorsShown()) {
          <p zzFieldError id="otp-error">{{ codeField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output id="otp-verified">{{ verified() }}</output>

      <div class="flex items-center gap-2">
        <div zzOtpField mask length="4" [(value)]="pin" id="otp-pin">
          <input
            zzOtpFieldInput
            aria-label="PIN"
            autocomplete="current-password"
            id="otp-pin-input"
          />
        </div>
        <output id="otp-pin-value">{{ pin().length }}</output>
      </div>

      <div zzField id="otp-locked-field">
        <label zzFieldLabel>Locked code</label>
        <div zzOtpField [formField]="codes.locked" id="otp-locked">
          <input zzOtpFieldInput id="otp-locked-input" />
        </div>
      </div>
      <div zzField id="otp-frozen-field">
        <label zzFieldLabel>Saved code</label>
        <div zzOtpField [formField]="codes.frozen" id="otp-frozen">
          <input zzOtpFieldInput id="otp-frozen-input" />
        </div>
      </div>

      <div zzOtpField [value]="'12'" class="[--otp-field-cell-size:3rem]" id="otp-large">
        <input zzOtpFieldInput aria-label="Large code" id="otp-large-input" />
      </div>
      <div class="w-[248px]" id="otp-narrow-wrap">
        <div zzOtpField [value]="'482913'" id="otp-narrow">
          <input zzOtpFieldInput aria-label="Narrow code" id="otp-narrow-input" />
        </div>
      </div>
      <div dir="rtl">
        <div zzOtpField [value]="'482913'" id="otp-rtl">
          <input zzOtpFieldInput aria-label="Right-to-left code" />
        </div>
      </div>
      <div class="light bg-background p-2">
        <div zzOtpField [value]="'4829'" id="otp-light">
          <input zzOtpFieldInput aria-label="Light code" id="otp-light-input" />
        </div>
      </div>

      <button zzButton variant="primary" type="submit" id="otp-save">Save code</button>
      <output id="otp-saves">{{ saves() }}</output>
    </form>
  `,
})
export class OtpFields {
  protected readonly pin = signal("");
  protected readonly verified = signal("");
  protected readonly saves = signal(0);

  // Every rule has a message: a rule without one gives an error whose message is undefined.
  protected readonly codes = form(signal({ code: "", locked: "482", frozen: "482913" }), (path) => {
    required(path.code, { message: "Enter the code" });
    pattern(path.code, /^[0-9]{6}$/, { message: "Enter all 6 digits" });
    disabled(path.locked);
    readonly(path.frozen);
  });

  protected async save(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.codes, async () => {
      this.saves.update((count) => count + 1);

      return undefined;
    });

    if (this.codes.code().invalid()) {
      this.codes.code().focusBoundControl();
    }
  }
}

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

// The FileField's size in Greek: the value part formats it in its injector's LOCALE_ID.
@Component({
  selector: "app-greek-file",
  imports: [FileFieldParts],
  providers: [{ provide: LOCALE_ID, useValue: "el-GR" }],
  template: `
    <div zzFileField [(value)]="file" id="file-greek">
      <label zzFileFieldButton id="file-greek-button">
        Επιλογή αρχείου <input zzFileFieldInput id="file-greek-input" />
      </label>
      <p zzFileFieldValue id="file-greek-value"></p>
    </div>
  `,
})
export class GreekFileField {
  protected readonly file = signal<File | null>(null);
}

const MB = 1024 * 1024;

// File field: both looks in Fields, disabled, standalone, narrow, Greek and light.
@Component({
  selector: "app-file-fields",
  imports: [
    Button,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FileFieldParts,
    FormField,
    GreekFileField,
    LucideUpload,
  ],
  template: `
    <section id="files" class="grid w-[410px] gap-4 p-5">
      <div zzField #invoiceField="zzField" id="file-button-field">
        <label zzFieldLabel id="file-button-label">Invoice</label>
        <div zzFileField [formField]="files.invoice" id="file-button-root">
          <label zzFileFieldButton id="file-button">
            <svg lucideUpload></svg> Choose file
            <input zzFileFieldInput accept=".pdf,.jpg,.jpeg,.png" id="file-button-input" />
          </label>
          <p zzFileFieldValue id="file-button-value"></p>
        </div>
        <p zzFieldDescription>PDF, JPG or PNG, up to 25 MB</p>
        @if (invoiceField.state.errorsShown()) {
          <p zzFieldError id="file-button-error">{{ invoiceField.state.errors()[0]?.message }}</p>
        }
      </div>
      <button zzButton type="button" (click)="saveInvoice()" id="file-button-save">
        Save invoice
      </button>

      <div zzField #attachmentField="zzField" id="file-zone-field">
        <label zzFieldLabel id="file-zone-label">Attachment</label>
        <div zzFileField [formField]="files.attachment" id="file-zone-root">
          <label zzFileFieldDropZone id="file-zone">
            <span
              ><span class="font-semibold text-foreground">Choose a file</span> or drag it
              here</span
            >
            <input zzFileFieldInput id="file-zone-input" />
          </label>
          <p zzFileFieldValue id="file-zone-value"></p>
        </div>
        @if (attachmentField.state.errorsShown()) {
          <p zzFieldError id="file-zone-error">{{ attachmentField.state.errors()[0]?.message }}</p>
        }
      </div>
      <output id="file-zone-touched">{{ files.attachment().touched() }}</output>
      <button zzButton type="button" (click)="saveAttachment()" id="file-zone-save">
        Save attachment
      </button>

      <div zzField id="file-locked">
        <label zzFieldLabel>Locked attachment</label>
        <div zzFileField [formField]="files.locked" id="file-locked-zone-root">
          <label zzFileFieldDropZone id="file-locked-zone">
            Choose a file or drag it here <input zzFileFieldInput id="file-locked-zone-input" />
          </label>
          <p zzFileFieldValue id="file-locked-zone-value"></p>
        </div>
      </div>
      <div zzFileField [(value)]="lockedFile" disabled id="file-locked-button-root">
        <label zzFileFieldButton id="file-locked-button">
          Choose file <input zzFileFieldInput id="file-locked-button-input" />
        </label>
        <p zzFileFieldValue id="file-locked-button-value"></p>
      </div>
      <button zzButton type="button" (click)="fillLocked()" id="file-locked-fill">
        Fill the locked field
      </button>

      <div class="flex items-center gap-2">
        <div zzFileField [(value)]="logo" id="file-primary-root">
          <label zzFileFieldButton variant="primary" size="sm" id="file-primary">
            Upload logo <input zzFileFieldInput accept="image/*" id="file-primary-input" />
          </label>
          <p zzFileFieldValue id="file-primary-value"></p>
        </div>
        <button
          zzButton
          variant="ghost"
          type="button"
          (click)="logo.set(null)"
          id="file-primary-clear"
        >
          Clear
        </button>
      </div>

      <div zzFileField [(value)]="statement" class="w-60" id="file-narrow">
        <label zzFileFieldButton size="sm" id="file-narrow-button">
          Choose <input zzFileFieldInput id="file-narrow-input" />
        </label>
        <p zzFileFieldValue id="file-narrow-value"></p>
      </div>

      <app-greek-file />

      <div class="light grid gap-4 bg-background p-4">
        <div zzFileField [(value)]="lightFile" id="file-light">
          <label zzFileFieldButton id="file-light-button">
            Choose file <input zzFileFieldInput id="file-light-input" />
          </label>
          <p zzFileFieldValue id="file-light-value"></p>
        </div>
        <div zzFileField id="file-light-zone-root">
          <label zzFileFieldDropZone id="file-light-zone">
            Choose a file or drag it here <input zzFileFieldInput id="file-light-zone-input" />
          </label>
        </div>
      </div>
    </section>
  `,
})
export class FileFields {
  protected readonly lockedFile = signal<File | null>(null);
  protected readonly logo = signal<File | null>(null);
  protected readonly statement = signal<File | null>(null);
  protected readonly lightFile = signal<File | null>(null);
  protected readonly files = form(
    signal({
      invoice: null as File | null,
      attachment: null as File | null,
      locked: null as File | null,
    }),
    (path) => {
      required(path.invoice, { message: "Choose the invoice" });
      validate(path.invoice, ({ value }) => {
        const file = value();

        return file !== null && file.size > 25 * MB
          ? { kind: "fileTooLarge", message: "Up to 25 MB" }
          : undefined;
      });
      required(path.attachment, { message: "Choose an attachment" });
      disabled(path.locked);
    },
  );

  protected async saveInvoice(): Promise<void> {
    await submit(this.files.invoice, {
      action: async () => undefined,
      onInvalid: (field) => field().focusBoundControl(),
    });
  }

  protected async saveAttachment(): Promise<void> {
    await submit(this.files.attachment, {
      action: async () => undefined,
      onInvalid: (field) => field().focusBoundControl(),
    });
  }

  // A disabled field still takes the app's own writes.
  protected fillLocked(): void {
    this.lockedFile.set(new File([new Uint8Array(1536)], "contract-2026.pdf"));
  }
}

@Component({
  selector: "app-root",
  imports: [
    Button,
    ButtonLink,
    AlertDialogParts,
    AvatarParts,
    Checkbox,
    ComboboxParts,
    DialogParts,
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
    FileFields,
    FormField,
    Input,
    LucideArchive,
    LucideChevronDown,
    LucideEllipsis,
    LucideLink,
    LucidePencil,
    LucideRotateCcw,
    LucideStore,
    LucideTrash,
    LucideTriangleAlert,
    MenuParts,
    NumberFieldParts,
    OtpFields,
    PopoverParts,
    Progress,
    RadioGroup,
    RadioGroupItem,
    ScrollArea,
    SelectParts,
    SheetParts,
    Slider,
    SliderThumb,
    Switch,
    TabsParts,
    Textarea,
    TooltipParts,
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
              <div zzField id="dialog-status-field">
                <span zzFieldLabel>Contract status</span>
                <div
                  zzSelect
                  [(value)]="dialogStatus"
                  #dialogStatusSelect="zzSelect"
                  id="dialog-status"
                >
                  <button zzSelectTrigger id="dialog-status-trigger">
                    {{ dialogStatusSelect.state.selectedOption()?.label ?? "Choose a status" }}
                  </button>
                  <div zzSelectContent id="dialog-status-content">
                    @for (option of statuses; track option.value) {
                      <div
                        zzSelectOption
                        [value]="option.value"
                        [label]="option.label"
                        [disabled]="option.retired"
                      >
                        {{ option.label }}
                      </div>
                    }
                  </div>
                </div>
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
        <button
          zzCheckbox
          aria-label="Select LC-2041"
          [(checked)]="selected"
          id="select-row"
        ></button>
        <output id="selected">{{ selected() }}</output>
      </div>
      <div
        zzRadioGroup
        aria-label="Density"
        [(value)]="density"
        class="flex-row gap-4"
        id="density"
      >
        <button zzRadioGroupItem value="compact">Compact</button>
        <button zzRadioGroupItem value="comfortable">Comfortable</button>
      </div>
      <!-- Select-all: the parent derives checked and mixed over the invoices it can change. -->
      <div class="grid gap-1" id="invoices">
        <div zzField orientation="horizontal">
          <button
            zzCheckbox
            aria-controls="invoice-0412 invoice-0413 invoice-0414"
            [checked]="allInvoices()"
            [mixed]="someInvoices()"
            (checkedChange)="selectAllInvoices($event)"
            id="all-invoices"
          ></button>
          <label zzFieldLabel>Select all invoices</label>
        </div>
        <div class="grid gap-1 ps-6">
          @for (invoice of invoices; track invoice) {
            <div zzField orientation="horizontal">
              <button
                zzCheckbox
                [id]="'invoice-' + invoice"
                [checked]="selectedInvoices().has(invoice)"
                (checkedChange)="selectInvoice(invoice, $event)"
              ></button>
              <label zzFieldLabel>Invoice {{ invoice }}</label>
            </div>
          }
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          zzCheckbox
          aria-label="Merged checkbox"
          class="rounded-full"
          id="merged-checkbox"
        ></button>
        <button zzSwitch aria-label="Merged switch" class="w-10" id="merged-switch"></button>
      </div>
      <div class="light flex items-center gap-2 bg-background p-2">
        <button
          zzCheckbox
          aria-label="Light checkbox"
          [checked]="true"
          id="light-checkbox"
        ></button>
        <button
          zzCheckbox
          aria-label="Light mixed checkbox"
          [mixed]="true"
          id="light-mixed-checkbox"
        ></button>
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

    <app-otp-fields />

    <!-- Select and Combobox. -->
    <section id="lists" class="grid gap-6 p-5">
      <form id="picks" class="grid gap-4" (submit)="savePicks($event)">
        <!-- Gallery layout, not a Field rule: the grid reserves room for the errors, so an error
             shown on blur doesn't move Save under a pointer press that started the blur. -->
        <div id="picks-fields" class="grid min-h-60 grid-cols-3 items-start gap-8">
          <div class="grid gap-4">
            <input zzInput aria-label="Plain status" value="Draft" id="list-plain-input" />
            <div zzField #statusField="zzField" id="status-field">
              <span zzFieldLabel id="status-label">Status</span>
              <div zzSelect [formField]="picks.status" #status="zzSelect" id="status">
                <button zzSelectTrigger id="status-trigger">
                  {{ status.state.selectedOption()?.label ?? "Choose a status" }}
                </button>
                <div zzSelectContent id="status-content">
                  @for (option of statuses; track option.value) {
                    <div
                      zzSelectOption
                      [value]="option.value"
                      [label]="option.label"
                      [disabled]="option.retired"
                      [id]="'status-' + option.value"
                    >
                      {{ option.label }}
                    </div>
                  }
                </div>
              </div>
              <p zzFieldDescription id="status-description">Where the contract stands.</p>
              @if (statusField.state.errorsShown()) {
                <p zzFieldError id="status-error">{{ statusField.state.errors()[0]?.message }}</p>
              }
            </div>
          </div>

          <div zzField #planetField="zzField" id="planet-field">
            <label zzFieldLabel id="planet-label">Planet</label>
            <div zzCombobox [formField]="picks.planet" [(query)]="planetQuery" id="planet">
              <input zzComboboxInput placeholder="Search planets" id="planet-input" />
              <button zzComboboxTrigger aria-label="All planets" id="planet-trigger"></button>
              <div zzComboboxContent id="planet-content">
                @for (planet of planets(); track planet.id) {
                  <div
                    zzComboboxOption
                    [value]="planet.id"
                    [label]="planet.name"
                    [disabled]="planet.dwarf"
                    [id]="'planet-' + planet.name.toLowerCase()"
                  >
                    {{ planet.name }}
                  </div>
                } @empty {
                  <p zzComboboxEmpty id="planet-empty">No planet matches “{{ planetQuery() }}”.</p>
                }
              </div>
            </div>
            <p zzFieldDescription id="planet-description">Where the trip goes.</p>
            @if (planetField.state.errorsShown()) {
              <p zzFieldError id="planet-error">{{ planetField.state.errors()[0]?.message }}</p>
            }
          </div>

          <div zzField id="country-field">
            <span zzFieldLabel id="country-label">Country</span>
            <div zzSelect [formField]="picks.country" #country="zzSelect" id="country">
              <button zzSelectTrigger id="country-trigger">
                {{ country.state.selectedOption()?.label ?? "Choose a country" }}
              </button>
              <div zzSelectContent id="country-content">
                @for (option of countries; track option.code) {
                  <div
                    zzSelectOption
                    [value]="option.code"
                    [label]="option.name"
                    [id]="'country-' + option.code.toLowerCase()"
                  >
                    {{ option.name }}
                  </div>
                }
              </div>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-4">
          <output id="status-value">{{ picks.status().value() }}</output>
          <output id="status-touched">{{ picks.status().touched() }}</output>
          <output id="planet-value">{{ picks.planet().value() }}</output>
          <output id="planet-touched">{{ picks.planet().touched() }}</output>
          <output id="country-value">{{ picks.country().value() }}</output>
          <output id="country-touched">{{ picks.country().touched() }}</output>
          <output id="pick-saves">{{ pickSaves() }}</output>
        </div>

        <!-- Nothing focusable between the Fields and Save, so Tab from Country reaches Save. -->
        <div class="flex gap-2">
          <button zzButton variant="primary" type="submit" id="picks-save">Save choices</button>
          <button
            zzButton
            type="button"
            (click)="picks.status().focusBoundControl()"
            id="focus-status"
          >
            Focus status
          </button>
          <button
            zzButton
            type="button"
            (click)="picks.planet().focusBoundControl()"
            id="focus-planet"
          >
            Focus planet
          </button>
        </div>
      </form>

      <div class="flex items-center gap-2">
        <div zzCombobox [(value)]="scrollingPlanet" class="w-80" id="scrolling-planet">
          <input zzComboboxInput aria-label="Scrolling planet" id="scrolling-planet-input" />
          <button zzComboboxTrigger aria-label="All planets"></button>
          <!-- 120px tall, so the list scrolls. -->
          <div zzComboboxContent class="max-h-30" id="scrolling-planet-content">
            @for (planet of allPlanets; track planet.id) {
              <div
                zzComboboxOption
                [value]="planet.id"
                [label]="planet.name"
                [disabled]="planet.dwarf"
              >
                {{ planet.name }}
              </div>
            }
          </div>
        </div>
        <button zzButton id="after-scrolling-planet">After the planets</button>
      </div>

      <div class="grid grid-cols-3 items-start gap-8">
        <div zzField id="locked-status-field">
          <span zzFieldLabel>Locked status</span>
          <div
            zzSelect
            [formField]="picks.lockedStatus"
            #lockedStatus="zzSelect"
            id="locked-status"
          >
            <button zzSelectTrigger id="locked-status-trigger">
              {{ lockedStatus.state.selectedOption()?.label ?? "Choose a status" }}
            </button>
            <div zzSelectContent>
              @for (option of statuses; track option.value) {
                <div zzSelectOption [value]="option.value" [label]="option.label">
                  {{ option.label }}
                </div>
              }
            </div>
          </div>
        </div>
        <div zzField id="frozen-status-field">
          <span zzFieldLabel>Frozen status</span>
          <div
            zzSelect
            [formField]="picks.frozenStatus"
            #frozenStatus="zzSelect"
            id="frozen-status"
          >
            <button zzSelectTrigger id="frozen-status-trigger">
              {{ frozenStatus.state.selectedOption()?.label ?? "Choose a status" }}
            </button>
            <div zzSelectContent id="frozen-status-content">
              @for (option of statuses; track option.value) {
                <div
                  zzSelectOption
                  [value]="option.value"
                  [label]="option.label"
                  [id]="'frozen-status-' + option.value"
                >
                  {{ option.label }}
                </div>
              }
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <div zzSelect [(value)]="sort" #sortBy="zzSelect" class="w-44" id="sort">
            <button zzSelectTrigger aria-label="Sort by" id="sort-trigger">
              {{ sortBy.state.selectedOption()?.label ?? "Sort by" }}
            </button>
            <div zzSelectContent id="sort-content">
              <div zzSelectOption value="newest" label="Newest first" id="sort-newest">
                Newest first
              </div>
              <div zzSelectOption value="oldest" label="Oldest first" id="sort-oldest">
                Oldest first
              </div>
            </div>
          </div>
          <output id="sort-value">{{ sort() }}</output>
        </div>

        <div zzField id="locked-planet-field">
          <label zzFieldLabel>Locked planet</label>
          <div zzCombobox [formField]="picks.lockedPlanet" query="Mercury" id="locked-planet">
            <input zzComboboxInput id="locked-planet-input" />
            <button zzComboboxTrigger aria-label="All planets" id="locked-planet-trigger"></button>
            <div zzComboboxContent>
              <div zzComboboxOption [value]="1" label="Mercury">Mercury</div>
            </div>
          </div>
        </div>
        <div zzField id="frozen-planet-field">
          <label zzFieldLabel>Frozen planet</label>
          <div zzCombobox [formField]="picks.frozenPlanet" query="Mercury" id="frozen-planet">
            <input zzComboboxInput id="frozen-planet-input" />
            <button zzComboboxTrigger aria-label="All planets" id="frozen-planet-trigger"></button>
            <div zzComboboxContent id="frozen-planet-content">
              <div zzComboboxOption [value]="1" label="Mercury" id="frozen-planet-mercury">
                Mercury
              </div>
              <div zzComboboxOption [value]="4" label="Mars" id="frozen-planet-mars">Mars</div>
            </div>
          </div>
          <output id="frozen-planet-value">{{ picks.frozenPlanet().value() }}</output>
        </div>

        <!-- A server search without a Trigger: two-line rows, the email in muted text. -->
        <div class="grid gap-2">
          <div zzCombobox [(value)]="customerId" [(query)]="customerQuery" id="customer">
            <input
              zzComboboxInput
              aria-label="Customer"
              placeholder="Name or email"
              id="customer-input"
            />
            <div zzComboboxContent id="customer-content">
              @for (customer of customers(); track customer.id) {
                <div
                  zzComboboxOption
                  [value]="customer.id"
                  [label]="customer.name"
                  [disabled]="customer.archived"
                  [id]="'customer-' + customer.id"
                >
                  <span class="block">{{ customer.name }}</span>
                  <span
                    class="block text-label font-normal text-muted-foreground"
                    [id]="'customer-' + customer.id + '-email'"
                  >
                    {{ customer.email }}
                  </span>
                </div>
              } @empty {
                <p zzComboboxEmpty id="customer-empty">No customers found.</p>
              }
            </div>
          </div>
          <output id="customer-value">{{ customerId() }}</output>
        </div>
      </div>

      <div dir="rtl">
        <div zzSelect value="active" #rtlStatus="zzSelect" class="w-72" id="rtl-select">
          <button zzSelectTrigger aria-label="Right-to-left status" id="rtl-select-trigger">
            {{ rtlStatus.state.selectedOption()?.label ?? "Choose a status" }}
          </button>
          <div zzSelectContent id="rtl-select-content">
            @for (option of statuses; track option.value) {
              <div
                zzSelectOption
                [value]="option.value"
                [label]="option.label"
                [id]="'rtl-select-' + option.value"
              >
                {{ option.label }}
              </div>
            }
          </div>
        </div>
      </div>

      <div class="light grid grid-cols-3 items-start gap-8 bg-background p-2">
        <input zzInput aria-label="Light plain status" value="Active" id="light-plain-input" />
        <div zzSelect value="active" #lightStatus="zzSelect" id="light-status">
          <button zzSelectTrigger aria-label="Light status" id="light-status-trigger">
            {{ lightStatus.state.selectedOption()?.label ?? "Choose a status" }}
          </button>
          <div zzSelectContent id="light-status-content">
            @for (option of statuses; track option.value) {
              <div
                zzSelectOption
                [value]="option.value"
                [label]="option.label"
                [disabled]="option.retired"
                [id]="'light-status-' + option.value"
              >
                {{ option.label }}
              </div>
            }
          </div>
        </div>
        <div zzCombobox [value]="1" query="Mercury" id="light-planet">
          <input zzComboboxInput aria-label="Light planet" id="light-planet-input" />
          <button zzComboboxTrigger aria-label="All planets"></button>
          <div zzComboboxContent>
            <div zzComboboxOption [value]="1" label="Mercury">Mercury</div>
            <div zzComboboxOption [value]="4" label="Mars">Mars</div>
          </div>
        </div>
      </div>

      <!-- The row spans the viewport, so the trigger's end is the viewport's. -->
      <div class="-mx-5 flex">
        <div zzSelect #edge="zzSelect" class="ms-auto w-32" id="edge-select">
          <button zzSelectTrigger aria-label="Region" id="edge-select-trigger">
            {{ edge.state.selectedOption()?.label ?? "Region" }}
          </button>
          <div zzSelectContent id="edge-select-content">
            <div zzSelectOption value="emea" label="Europe, the Middle East and Africa">
              Europe, the Middle East and Africa
            </div>
            <div zzSelectOption value="apac" label="Asia and the Pacific">Asia and the Pacific</div>
          </div>
        </div>
      </div>
    </section>
    <app-file-fields />
    <section id="layers" class="grid gap-8 p-5">
      <section zzTabs [(value)]="view" #tabs="zzTabs" id="tabs">
        <div zzTabsList aria-label="Contract lists" id="tabs-list">
          <button zzTabsTrigger value="all" id="tab-all">All contracts</button>
          <button zzTabsTrigger value="drafts" id="tab-drafts">
            Drafts <span class="text-label font-normal text-muted-foreground tabular-nums">3</span>
          </button>
          <button zzTabsTrigger value="archived" disabled id="tab-archived">
            <svg lucideArchive aria-hidden="true"></svg> Archived
          </button>
          <button zzTabsTrigger value="reports" id="tab-reports">Reports</button>
        </div>
        <div zzTabsPanel value="all" id="panel-all">
          <p>Every contract.</p>
          <section zzTabs value="active" id="inner-tabs">
            <div zzTabsList aria-label="Contract states">
              <button zzTabsTrigger value="active" id="inner-active">Active</button>
              <button zzTabsTrigger value="ended" id="inner-ended">Ended</button>
            </div>
            <div zzTabsPanel value="active">Active contracts.</div>
            <div zzTabsPanel value="ended">Ended contracts.</div>
          </section>
        </div>
        <div zzTabsPanel value="drafts" class="grid" id="panel-drafts">Draft contracts.</div>
        <div zzTabsPanel value="archived" id="panel-archived">Archived contracts.</div>
        <div zzTabsPanel value="reports" id="panel-reports">
          @if (tabs.state.value() === "reports") {
            <p id="reports-body">Reports.</p>
          }
        </div>
      </section>

      <section zzTabs orientation="vertical" value="profile" id="vtabs">
        <div zzTabsList aria-label="Settings" id="vtabs-list">
          <button zzTabsTrigger value="profile" id="vtab-profile">Profile</button>
          <button zzTabsTrigger value="security" id="vtab-security">Security</button>
          <button zzTabsTrigger value="billing" disabled focusableWhenDisabled id="vtab-billing">
            Billing
          </button>
          <button zzTabsTrigger value="team" disabled id="vtab-team">Team</button>
        </div>
        <div zzTabsPanel value="profile" id="vpanel-profile">Your profile.</div>
        <div zzTabsPanel value="security" id="vpanel-security">Sign-in and sessions.</div>
        <div zzTabsPanel value="billing">Invoices.</div>
        <div zzTabsPanel value="team">Members.</div>
      </section>

      <div class="flex items-center gap-2" id="tips">
        <span zzTooltip id="tip-save">
          <button zzButton zzTooltipTrigger id="tip-save-trigger">Save draft</button>
          <span zzTooltipContent id="tip-save-content">Saves without publishing</span>
        </span>
        <span zzTooltip id="tip-copy">
          <button
            zzButton
            size="icon"
            variant="ghost"
            aria-label="Copy link"
            zzTooltipTrigger
            id="tip-copy-trigger"
          >
            <svg lucideLink aria-hidden="true"></svg>
          </button>
          <span zzTooltipContent id="tip-copy-content">Copies the address of this page</span>
        </span>
        <span zzTooltip id="tip-publish">
          <button
            zzButton
            variant="primary"
            [disabled]="!dirty()"
            focusableWhenDisabled
            zzTooltipTrigger
            (click)="publish()"
            id="tip-publish-trigger"
          >
            Publish
          </button>
          <span zzTooltipContent id="tip-publish-content">
            @if (dirty()) {
              Publishes your changes
            } @else {
              Nothing to publish yet
            }
          </span>
        </span>
        <button zzButton variant="ghost" (click)="dirty.set(true)" id="edit-draft">Edit</button>
        <output id="publish-count">{{ publishes() }}</output>

        <div zzPopover [(open)]="popoverFiltersOpen" id="filters">
          <span zzTooltip id="tip-filters">
            <button zzPopoverTrigger zzTooltipTrigger id="filters-trigger">
              Filters <svg lucideChevronDown aria-hidden="true"></svg>
            </button>
            <span zzTooltipContent id="tip-filters-content">Narrow the list</span>
          </span>
          <div
            zzPopoverContent
            aria-labelledby="filters-title"
            #filters="zzPopoverContent"
            id="filters-content"
          >
            <h2 id="filters-title" class="mb-2 text-title">Filters</h2>
            @if (filters.state.open()) {
              <div class="grid gap-3">
                <div zzField>
                  <label zzFieldLabel>Owner</label>
                  <input zzInput id="filter-owner" />
                </div>
                <div class="flex items-center justify-between">
                  <span zzTooltip id="tip-reset">
                    <button
                      zzButton
                      size="icon"
                      variant="ghost"
                      aria-label="Reset filters"
                      zzTooltipTrigger
                      id="filter-reset"
                    >
                      <svg lucideRotateCcw aria-hidden="true"></svg>
                    </button>
                    <span zzTooltipContent id="tip-reset-content">Clears every filter</span>
                  </span>
                  <button
                    zzButton
                    variant="primary"
                    (click)="popoverFiltersOpen.set(false)"
                    id="filter-apply"
                  >
                    Apply
                  </button>
                </div>
              </div>
            }
          </div>
        </div>
        <button zzButton variant="ghost" id="after-filters">Export</button>

        <div zzPopover id="notes-popover">
          <button zzPopoverTrigger variant="ghost" id="notes-trigger">Release notes</button>
          <div zzPopoverContent aria-label="Release notes" tabindex="0" id="notes-content">
            @for (note of releaseNotes; track $index) {
              <p class="mb-2">{{ note }}</p>
            }
          </div>
        </div>

        <div zzPopover id="scrollform-popover">
          <button zzPopoverTrigger id="scrollform-trigger">Address</button>
          <div zzPopoverContent aria-label="Address" id="scrollform-content">
            <div class="grid gap-3">
              @for (line of addressLines; track line) {
                <div zzField>
                  <label zzFieldLabel>{{ line }}</label>
                  <input zzInput [id]="'scrollform-' + $index" />
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <div zzField id="tip-status-field">
        <span zzFieldLabel>Region</span>
        <div zzSelect value="emea" #region="zzSelect">
          <span zzTooltip>
            <button zzSelectTrigger zzTooltipTrigger id="tip-status">
              {{ region.state.selectedOption()?.label ?? "Choose a region" }}
            </button>
            <span zzTooltipContent id="tip-status-content">Where invoices are issued</span>
          </span>
          <div zzSelectContent>
            <div zzSelectOption value="emea" label="Europe">Europe</div>
            <div zzSelectOption value="apac" label="Asia">Asia</div>
          </div>
        </div>
        <p zzFieldDescription id="tip-status-description">Sets the invoice currency.</p>
      </div>
    </section>
    <!-- Room before the triggers, so an end-aligned panel and the View submenu fit at 1280px. -->
    <section id="menus" class="flex items-start gap-4 p-5 ps-80">
      <div zzMenu id="menu-row">
        <button
          zzMenuTrigger
          variant="ghost"
          size="icon"
          aria-label="Actions for LC-2041"
          id="menu-row-trigger"
        >
          <svg lucideEllipsis aria-hidden="true"></svg>
        </button>
        <div zzMenuContent align="end" id="menu-row-content">
          <a zzMenuLink href="#edit" id="menu-row-edit">
            <svg lucidePencil aria-hidden="true"></svg> Edit
            <span zzMenuShortcut id="menu-row-shortcut">⌘E</span>
          </a>
          <div zzMenuSeparator id="menu-row-separator"></div>
          <button
            zzMenuItem
            variant="destructive"
            (select)="menuStatus.set('Deleted LC-2041')"
            id="menu-row-delete"
          >
            <svg lucideTrash aria-hidden="true"></svg> Delete
          </button>
        </div>
      </div>
      <output id="menu-row-status">{{ menuStatus() }}</output>

      <div zzMenu id="menu-view">
        <button zzMenuTrigger id="menu-view-trigger">
          View <svg lucideChevronDown aria-hidden="true"></svg>
        </button>
        <div zzMenuContent align="end" id="menu-view-content">
          <div zzMenuGroup id="menu-view-show">
            <div zzMenuGroupLabel id="menu-view-show-label">Show</div>
            <button zzMenuCheckboxItem [(checked)]="menuShowCompleted" id="menu-view-completed">
              Completed tasks
            </button>
            <button zzMenuCheckboxItem [(checked)]="menuShowArchived" id="menu-view-archived">
              Archived tasks
            </button>
          </div>
          <div zzMenuSeparator></div>
          <div zzMenuRadioGroup [(value)]="menuDensity" id="menu-view-density">
            <div zzMenuGroupLabel id="menu-view-density-label">Density</div>
            <button zzMenuRadioItem value="compact" id="menu-view-compact">Compact</button>
            <button zzMenuRadioItem value="comfortable" id="menu-view-comfortable">
              Comfortable
            </button>
          </div>
          <div zzMenuSeparator></div>
          <div zzMenuSub id="menu-view-move">
            <button zzMenuSubTrigger id="menu-view-move-trigger">Move to</button>
            <div zzMenuContent id="menu-view-move-content">
              <button zzMenuItem (select)="menuMoved.set('backlog')" id="menu-view-backlog">
                Backlog
              </button>
              <button zzMenuItem (select)="menuMoved.set('doing')">Doing</button>
              <button zzMenuItem (select)="menuMoved.set('done')">Done</button>
            </div>
          </div>
          <button zzMenuItem disabled id="menu-view-archive">Archive project</button>
          <button zzMenuItem class="ps-6" id="menu-view-merged">Print</button>
        </div>
      </div>
      <output id="menu-view-completed-value">{{ menuShowCompleted() }}</output>
      <output id="menu-view-archived-value">{{ menuShowArchived() }}</output>
      <output id="menu-view-density-value">{{ menuDensity() }}</output>
      <output id="menu-view-moved">{{ menuMoved() }}</output>
    </section>
    <section id="display" class="grid gap-8 p-5">
      <div class="grid gap-2">
        <h2 id="sa-both-title" class="text-title">Addresses</h2>
        <div
          class="h-56 w-[626px] max-w-full rounded-surface border border-border"
          id="sa-both-bound"
        >
          <div
            zzScrollArea
            orientation="both"
            aria-labelledby="sa-both-title"
            class="size-full rounded-[inherit]"
            #area="zzScrollArea"
            id="sa-both"
          >
            <table class="w-[940px] text-left">
              <tbody>
                @for (row of displayRows; track row) {
                  <tr class="h-9 border-b border-border">
                    <td class="px-3">{{ row + 1 }}</td>
                    <td class="px-3">Ada Lovelace</td>
                    <td class="px-3">12 Marylebone Road</td>
                    <td class="px-3">London</td>
                    <td class="px-3">NW1 5LR</td>
                    <td class="px-3">United Kingdom</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
        <button
          zzButton
          class="justify-self-start"
          (click)="area.viewport().scrollTo({ left: 250, top: 220 })"
          id="sa-scroll"
        >
          Scroll to the middle
        </button>
      </div>

      <div class="grid grid-cols-3 items-start gap-6">
        <div class="grid gap-2">
          <div zzScrollArea [aria-label]="notesName()" class="h-56" id="sa-vertical">
            <div class="grid gap-3 p-3">
              @for (row of noteRows; track row) {
                <p>
                  Deliveries before nine go to the loading bay on the north side; after nine, ring
                  the front desk and wait for the porter. Note {{ row + 1 }}.
                </p>
              }
            </div>
          </div>
          <button
            zzButton
            class="justify-self-start"
            (click)="notesName.set('Updated delivery notes')"
            id="sa-rename"
          >
            Rename notes
          </button>
        </div>

        <div zzScrollArea orientation="horizontal" aria-label="Columns" id="sa-horizontal">
          <div class="flex w-max gap-2 p-3">
            @for (column of displayColumns; track column) {
              <div class="w-32 rounded-control border border-border p-3">{{ column }}</div>
            }
          </div>
        </div>

        <div class="flex h-80 flex-col rounded-surface border border-border" id="sa-panel-bound">
          <header class="flex h-12 shrink-0 items-center px-3 text-title" id="sa-panel-header">
            Filters
          </header>
          <div zzScrollArea aria-label="Filters" class="grow" id="sa-panel">
            @for (row of displayRows; track row) {
              <div class="flex h-8 items-center px-3">Filter {{ row + 1 }}</div>
            }
          </div>
          <footer class="flex h-12 shrink-0 items-center px-3" id="sa-panel-footer">Apply</footer>
        </div>

        <div zzScrollArea aria-label="Delivery notes list" class="max-h-60" id="sa-capped">
          <ul class="grid gap-2 p-3">
            @for (row of displayRows; track row) {
              <li class="flex h-8 items-center">Delivery {{ row + 1 }}</li>
            }
          </ul>
        </div>

        <div zzScrollArea aria-label="Recent deliveries" class="max-h-60" id="sa-short">
          @for (row of shortRows; track row) {
            <div class="flex h-8 items-center px-3">Delivery {{ row + 1 }}</div>
          }
        </div>
      </div>

      <div class="grid gap-3" id="avatars">
        @for (shape of avatarShapes; track shape) {
          <div class="flex items-center gap-3">
            @for (size of avatarSizes; track size) {
              <span zzAvatar [shape]="shape" [size]="size" [id]="'avatar-' + shape + '-' + size">
                <span zzAvatarFallback aria-hidden="true">TM</span>
                <img zzAvatarImage [src]="loadedPhoto" alt="" />
              </span>
              <span
                zzAvatar
                [shape]="shape"
                [size]="size"
                [id]="'avatar-' + shape + '-' + size + '-idle'"
              >
                <span zzAvatarFallback aria-hidden="true">TM</span>
                <img zzAvatarImage [src]="null" alt="" />
              </span>
              <span
                zzAvatar
                [shape]="shape"
                [size]="size"
                [id]="'avatar-' + shape + '-' + size + '-error'"
              >
                <span zzAvatarFallback aria-hidden="true">TM</span>
                <img zzAvatarImage [src]="brokenPhoto" alt="" />
              </span>
            }
            <span zzAvatar [shape]="shape" size="lg" [id]="'avatar-' + shape + '-icon'">
              <span zzAvatarFallback aria-hidden="true"><svg lucideStore></svg></span>
              <img zzAvatarImage [src]="null" alt="" />
            </span>
          </div>
        }
        <div class="flex items-center gap-3">
          <span zzAvatar class="size-32 border border-input text-headline" id="avatar-large">
            <span zzAvatarFallback aria-hidden="true">TM</span>
            <img zzAvatarImage [src]="null" alt="" />
          </span>
          <span zzAvatar shape="square" class="size-32 text-headline" id="avatar-square-large">
            <span zzAvatarFallback aria-hidden="true">TM</span>
          </span>
          <span
            zzAvatar
            shape="square"
            class="size-32 rounded-control text-headline"
            id="avatar-square-large-radius"
          >
            <span zzAvatarFallback aria-hidden="true">TM</span>
          </span>
          <span zzAvatar size="lg" id="avatar-slow">
            <span zzAvatarFallback aria-hidden="true" id="avatar-slow-fallback">AL</span>
            <img zzAvatarImage [src]="slowPhoto()" alt="" />
          </span>
          <span zzAvatar size="lg" id="avatar-slow-now">
            <span
              zzAvatarFallback
              aria-hidden="true"
              class="animate-none!"
              id="avatar-slow-now-fallback"
            >
              AL
            </span>
            <img zzAvatarImage [src]="slowPhotoNow()" alt="" />
          </span>
          <button zzButton (click)="loadSlowPhotos()" id="avatar-load">Load photos</button>
          <span zzAvatar role="img" aria-label="Grace Hopper" id="avatar-named">
            <span zzAvatarFallback aria-hidden="true">GH</span>
            <img zzAvatarImage [src]="loadedPhoto" alt="" />
          </span>
        </div>
      </div>

      <div class="grid w-[626px] max-w-full gap-4" id="bars">
        <div zzProgress [value]="40" aria-label="Upload" id="progress-40"></div>
        <div zzProgress value="3" max="3" aria-label="Import" id="progress-complete"></div>
        <div zzProgress aria-label="Loading reservations" class="h-1" id="progress-unknown"></div>
        <div
          zzProgress
          aria-label="Syncing"
          class="[&>[data-slot=progress-fill]]:animate-none!"
          id="progress-still"
        ></div>
        <div class="flex items-center gap-3">
          <div
            zzProgress
            [value]="620"
            [max]="1000"
            aria-label="Campaign"
            class="h-6"
            #campaign="zzProgress"
            id="progress-campaign"
          ></div>
          <span aria-hidden="true" class="tabular-nums" id="progress-campaign-text">
            {{ campaign.state.valueText() }}
          </span>
        </div>

        <div zzDialog>
          <button zzDialogTrigger class="justify-self-start" id="steps-trigger">New deposit</button>
          <dialog zzDialogContent class="gap-0" id="steps-dialog">
            <div zzDialogHeader class="pb-5">
              <h2 zzDialogTitle>New deposit</h2>
              <p zzDialogDescription id="steps-description">Step 2 of 3 · Review details</p>
            </div>
            <div
              zzProgress
              value="2"
              max="3"
              aria-label="Deposit steps"
              class="-mx-5 w-auto shrink-0 rounded-none"
              id="steps-progress"
            ></div>
            <div zzDialogBody class="my-0 grid gap-4 py-5" id="steps-body">
              <p>Confirm the amount and the account before you continue.</p>
              @for (line of stepFields; track line) {
                <div zzField>
                  <label zzFieldLabel>{{ line }}</label>
                  <input zzInput />
                </div>
              }
            </div>
            <div zzDialogFooter>
              <button zzDialogClose>Back</button>
              <button zzButton variant="primary">Confirm deposit</button>
            </div>
          </dialog>
        </div>
      </div>

      <div class="light grid w-80 gap-4 bg-background p-2 text-foreground">
        <div zzScrollArea aria-label="Light notes" class="h-24" id="sa-light">
          @for (row of noteRows; track row) {
            <div class="flex h-8 items-center px-3">Light note {{ row + 1 }}</div>
          }
        </div>
        <span zzAvatar id="avatar-light">
          <span zzAvatarFallback aria-hidden="true">TM</span>
        </span>
        <div zzProgress [value]="40" aria-label="Light upload" id="progress-light"></div>
      </div>
    </section>
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
  protected readonly popoverFiltersOpen = signal(false);
  protected readonly view = signal<string | null>("all");
  protected readonly dirty = signal(false);
  protected readonly publishes = signal(0);
  protected readonly menuStatus = signal("");
  protected readonly menuShowCompleted = signal(true);
  protected readonly menuShowArchived = signal(false);
  protected readonly menuDensity = signal<string | null>("comfortable");
  protected readonly menuMoved = signal("");
  protected readonly releaseNotes = Array.from(
    { length: 14 },
    (_, index) =>
      `Release ${index + 1}: invoices group by customer, contract dates follow your locale, and exports keep their filters.`,
  );
  protected readonly addressLines = [
    "Street",
    "Number",
    "Floor",
    "Postal code",
    "City",
    "Region",
    "Country",
    "Phone",
  ];
  protected readonly invoices = ["0412", "0413", "0414"];
  protected readonly selectedInvoices = signal<ReadonlySet<string>>(new Set(["0412"]));
  protected readonly allInvoices = computed(() => {
    for (const invoice of this.invoices) {
      if (!this.selectedInvoices().has(invoice)) {
        return false;
      }
    }

    return true;
  });
  protected readonly someInvoices = computed(
    () => this.selectedInvoices().size > 0 && !this.allInvoices(),
  );
  protected readonly density = signal<string | null>("compact");
  protected readonly tierAddon = signal<string | null>("a");
  protected readonly controlSaves = signal(0);
  protected readonly bareAmount = signal<number | null>(1234.5);
  protected readonly quantity = signal<number | null>(3);
  protected readonly rtlZoom = signal(25);
  protected readonly numberSaves = signal(0);
  protected readonly dialogStatus = signal<string | null>("active");
  protected readonly planetQuery = signal("");
  protected readonly scrollingPlanet = signal<number | null>(null);
  protected readonly sort = signal<string | null>(null);
  protected readonly customerId = signal<number | null>(null);
  protected readonly customerQuery = signal("");
  protected readonly pickSaves = signal(0);
  protected readonly statuses = [
    { value: "draft", label: "Draft", retired: false },
    { value: "active", label: "Active", retired: false },
    { value: "paused", label: "Paused", retired: true },
    { value: "ended", label: "Ended", retired: false },
  ];
  protected readonly allPlanets = PLANETS;
  protected readonly countries = COUNTRIES;
  protected readonly cycles = [
    { value: "monthly", label: "Monthly", locked: false },
    { value: "weekly", label: "Weekly", locked: true },
    { value: "quarterly", label: "Quarterly", locked: false },
    { value: "yearly", label: "Yearly", locked: false },
  ];
  protected readonly displayRows = Array.from({ length: 24 }, (_, index) => index);
  protected readonly noteRows = this.displayRows.slice(0, 8);
  protected readonly shortRows = this.displayRows.slice(0, 3);
  protected readonly displayColumns = [
    "Number",
    "Name",
    "Street",
    "City",
    "Postal code",
    "Country",
    "Phone",
    "Email",
  ];
  protected readonly notesName = signal("Delivery notes");
  protected readonly stepFields = ["Amount", "Account", "Reference"];
  protected readonly avatarShapes = ["circle", "square"] as const;
  protected readonly avatarSizes = ["sm", "md", "lg"] as const;
  // A sized SVG, so it loads with a natural width, and a PNG that fails to decode; neither is a
  // network request.
  protected readonly loadedPhoto =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64'%3E%3Crect width='64' height='64' fill='%2326803f'/%3E%3C/svg%3E";
  protected readonly brokenPhoto = "data:image/png;base64,AAAA";
  // The smoke holds these requests to watch the fallback's delay.
  protected readonly slowPhoto = signal<string | null>(null);
  protected readonly slowPhotoNow = signal<string | null>(null);
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

  protected readonly picks = form(
    signal({
      status: null as string | null,
      planet: null as number | null,
      country: "GR" as string | null,
      lockedStatus: "active" as string | null,
      frozenStatus: "active" as string | null,
      lockedPlanet: 1 as number | null,
      frozenPlanet: 1 as number | null,
    }),
    (path) => {
      required(path.status, { message: "Choose a status" });
      required(path.planet, { message: "Choose a planet" });
      required(path.country, { message: "Choose a country" });
      disabled(path.lockedStatus);
      readonly(path.frozenStatus);
      disabled(path.lockedPlanet);
      readonly(path.frozenPlanet);
    },
  );

  // The chosen planet's label is the query after a choice: every planet shows then, not only it.
  protected readonly planets = computed(() => {
    const query = this.planetQuery().trim().toLocaleLowerCase();
    const chosen = PLANETS.find((planet) => planet.id === this.picks.planet().value());

    if (query === "" || chosen?.name.toLocaleLowerCase() === query) {
      return PLANETS;
    }

    return PLANETS.filter((planet) => planet.name.toLocaleLowerCase().startsWith(query));
  });

  protected readonly customers = computed(() => {
    const query = this.customerQuery().trim().toLocaleLowerCase();

    return CUSTOMERS.filter((customer) => customer.name.toLocaleLowerCase().includes(query));
  });

  protected async savePicks(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.picks, async () => {
      this.pickSaves.update((count) => count + 1);

      return undefined;
    });
  }

  protected async saveNumbers(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.numbers, async () => {
      this.numberSaves.update((count) => count + 1);

      return undefined;
    });
  }

  protected selectAllInvoices(checked: boolean): void {
    if (checked) {
      this.selectedInvoices.set(new Set(this.invoices));

      return;
    }

    this.selectedInvoices.set(new Set());
  }

  protected selectInvoice(invoice: string, checked: boolean): void {
    const next = new Set(this.selectedInvoices());

    if (checked) {
      next.add(invoice);
    } else {
      next.delete(invoice);
    }

    this.selectedInvoices.set(next);
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

  protected publish(): void {
    // A focusable disabled button still dispatches clicks, from a pointer, Enter or Space.
    if (!this.dirty()) {
      return;
    }

    this.publishes.update((count) => count + 1);
  }

  protected loadSlowPhotos(): void {
    this.slowPhoto.set("/slow-avatar.svg");
    this.slowPhotoNow.set("/slow-avatar-2.svg");
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
