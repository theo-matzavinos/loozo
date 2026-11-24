// The root component of the consumer check's app (consumer.mjs), using the components `add`
// copied with the prefix `zz`. consumer-smoke.mjs reads its ids.
import { CurrencyPipe, DatePipe } from "@angular/common";
import { Component, LOCALE_ID, computed, inject, input, signal } from "@angular/core";
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
import type { OrigamiDateRange } from "@loozo/origami-ui/calendar";
import { OrigamiDialog, injectOrigamiDialogOpener } from "@loozo/origami-ui/dialog";
import { OrigamiMeter, OrigamiMeterOptions } from "@loozo/origami-ui/meter";
import { AlertDialogParts } from "#ui/alert-dialog";
import { AvatarParts } from "#ui/avatar";
import { Badge } from "#ui/badge";
import { Button, ButtonLink } from "#ui/button";
import {
  Calendar,
  CalendarMultiple,
  CalendarRange,
  MonthCalendar,
  provideCalendarLabels,
} from "#ui/calendar";
import { Checkbox } from "#ui/checkbox";
import { ComboboxParts } from "#ui/combobox";
import {
  DateField,
  DateFieldInput,
  DateTimeField,
  TimeField,
  provideDateFieldPlaceholders,
} from "#ui/date-field";
import {
  DatePickerMultipleParts,
  DatePickerParts,
  DatePickerRangeParts,
  DateTimePickerParts,
  MonthPickerParts,
} from "#ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogParts,
  DialogTitle,
} from "#ui/dialog";
import { EmptyParts } from "#ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "#ui/field";
import { FileFieldParts } from "#ui/file-field";
import { Input } from "#ui/input";
import { MenuParts } from "#ui/menu";
import { Meter, MeterRing } from "#ui/meter";
import { NumberFieldParts } from "#ui/number-field";
import { OtpField, OtpFieldInput } from "#ui/otp-field";
import { PageParts } from "#ui/page";
import { PopoverParts } from "#ui/popover";
import { Progress } from "#ui/progress";
import { RadioGroup, RadioGroupItem } from "#ui/radio-group";
import { ScrollArea } from "#ui/scroll-area";
import { SelectParts } from "#ui/select";
import { SheetParts } from "#ui/sheet";
import { Slider, SliderThumb } from "#ui/slider";
import { Switch } from "#ui/switch";
import { TableParts, type TableSort } from "#ui/table";
import { TabsParts } from "#ui/tabs";
import { Textarea } from "#ui/textarea";
import { ToastRegion, Toasts } from "#ui/toast";
import { Toggle } from "#ui/toggle";
import { ToggleGroupParts } from "#ui/toggle-group";
import { ToolbarParts } from "#ui/toolbar";
import { TooltipParts } from "#ui/tooltip";
import {
  LucideArchive,
  LucideBell,
  LucideBold,
  LucideChevronDown,
  LucideCopy,
  LucideEllipsis,
  LucideItalic,
  LucideLink,
  LucidePencil,
  LucidePin,
  LucideRedo2,
  LucideRotateCcw,
  LucideStore,
  LucideTrash,
  LucideTriangleAlert,
  LucideUndo2,
  LucideUpload,
  LucideWrapText,
} from "@lucide/angular";
// Meter's internal thresholds directive, which the Options probe below composes as a copied Meter
// does. The path resolves in the generated app (src/app → src/ui), not in this repository; an
// expect-error directive would fail the generated app's build, where it does resolve.
// @ts-ignore
import { MeterThresholds } from "../ui/meter/meter-thresholds";

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

// Calendar: every day root pins today and the Monday week start, so the grids are the same on any
// day (October 2026 from Monday has 5 weeks: 28 September to 1 November). Greek strings come from a
// component-level provider, so they stay in this subtree.
@Component({
  selector: "app-greek-calendar",
  imports: [Calendar],
  providers: [
    provideCalendarLabels({
      previous: {
        days: "Προηγούμενος μήνας",
        months: "Προηγούμενο έτος",
        years: "Προηγούμενα 12 έτη",
      },
      next: { days: "Επόμενος μήνας", months: "Επόμενο έτος", years: "Επόμενα 12 έτη" },
      show: { days: "εμφάνιση ημερών", months: "εμφάνιση μηνών", years: "εμφάνιση ετών" },
      chooseFirstDay: "Επιλέξτε την πρώτη ημέρα",
      chooseLastDay: "Επιλέξτε την τελευταία ημέρα",
    }),
  ],
  template: `
    <div
      zzCalendar
      value="2026-09-14"
      today="2026-10-27"
      [weekStart]="1"
      locale="el"
      selectedDescription="επιλεγμένη"
      id="cal-el"
    ></div>
  `,
})
export class GreekCalendar {}

@Component({
  selector: "app-calendars",
  imports: [
    Calendar,
    CalendarMultiple,
    CalendarRange,
    Field,
    FieldError,
    FieldLabel,
    FormField,
    GreekCalendar,
    MonthCalendar,
  ],
  template: `
    <section id="calendars" class="flex flex-wrap items-start gap-6 p-5">
      <div zzField #dueField="zzField" id="cal-due-field" class="w-fit">
        <span zzFieldLabel id="cal-due-label">Appeal date</span>
        <div
          zzCalendar
          [formField]="calendars.due"
          minDate="2026-10-05"
          [dateDisabled]="isWeekendDay"
          today="2026-10-27"
          [weekStart]="1"
          selectedDescription="selected"
          id="cal-due"
        ></div>
        @if (dueField.state.errorsShown()) {
          <p zzFieldError id="cal-due-error">{{ dueField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div
        zzCalendarMultiple
        [(value)]="holidays"
        today="2026-10-27"
        [weekStart]="1"
        fixedWeeks
        selectedDescription="selected"
        id="cal-holidays"
      ></div>
      <div zzField id="cal-stay-field" class="w-fit">
        <span zzFieldLabel>Stay</span>
        <div
          zzCalendarRange
          [formField]="calendars.stay"
          (valueChange)="stayWrites.set(stayWrites() + 1)"
          today="2026-10-27"
          [weekStart]="1"
          selectedDescription="selected"
          id="cal-stay"
        ></div>
      </div>
      <output id="cal-stay-writes">{{ stayWrites() }}</output>
      <div
        zzMonthCalendar
        [(value)]="billingMonth"
        maxMonth="2026-12"
        today="2026-10-27"
        selectedDescription="selected"
        id="cal-billing"
      ></div>
      <div zzField id="cal-readonly-field" class="w-fit">
        <span zzFieldLabel>Frozen date</span>
        <div
          zzCalendar
          [formField]="calendars.frozen"
          today="2026-10-27"
          [weekStart]="1"
          id="cal-readonly"
        ></div>
      </div>
      <div zzField id="cal-disabled-field" class="w-fit">
        <span zzFieldLabel>Locked date</span>
        <div
          zzCalendar
          [formField]="calendars.locked"
          today="2026-10-27"
          [weekStart]="1"
          id="cal-disabled"
        ></div>
      </div>
      <div
        zzCalendarRange
        readonly
        [value]="stay"
        today="2026-10-27"
        [weekStart]="1"
        id="cal-range-readonly"
      ></div>
      <div
        zzCalendarRange
        disabled
        [value]="stay"
        today="2026-10-27"
        [weekStart]="1"
        id="cal-range-disabled"
      ></div>
      <div dir="rtl">
        <div zzCalendarRange [value]="stay" today="2026-10-27" [weekStart]="1" id="cal-rtl"></div>
        <div dir="ltr">
          <div zzCalendar today="2026-10-27" [weekStart]="1" id="cal-ltr-in-rtl"></div>
        </div>
      </div>
      <div class="light bg-background p-2">
        <div zzCalendarRange [value]="stay" today="2026-10-27" [weekStart]="1" id="cal-light"></div>
      </div>
      <app-greek-calendar />
      <div zzCalendar [weekStart]="1" id="cal-seed"></div>
    </section>
  `,
})
export class Calendars {
  protected readonly stay = { start: "2026-10-14", end: "2026-10-23" };
  protected readonly holidays = signal<readonly string[]>([
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-20",
    "2026-11-03",
  ]);
  protected readonly billingMonth = signal<string | null>("2026-10");
  protected readonly stayWrites = signal(0);
  protected readonly calendars = form(
    signal({
      due: null as string | null,
      stay: this.stay as { start: string; end: string } | null,
      frozen: "2026-10-14" as string | null,
      locked: "2026-10-14" as string | null,
    }),
    (path) => {
      required(path.due, { message: "Choose an appeal date." });
      readonly(path.frozen);
      disabled(path.locked);
    },
  );

  protected isWeekendDay(date: string): boolean {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();

    return day === 0 || day === 6;
  }
}

// Date entry: the date, time and date-time fields and the single date picker in its field and
// button shapes. Every Calendar pins today and the Monday week start. Greek tokens come from a
// component-level provider, so they stay in this subtree.
@Component({
  selector: "app-greek-date-field",
  imports: [DateField, DateFieldInput],
  providers: [
    provideDateFieldPlaceholders({
      year: "εεεε",
      month: "μμ",
      day: "ηη",
      hour: "ωω",
      minute: "λλ",
      second: "δδ",
      dayPeriod: "π.μ./μ.μ.",
    }),
  ],
  template: `
    <div zzDateField locale="el" id="df-el">
      <div zzDateFieldInput aria-label="Ημερομηνία γέννησης"></div>
    </div>
  `,
})
export class GreekDateField {}

@Component({
  selector: "app-date-entries",
  imports: [
    Button,
    DateField,
    DateFieldInput,
    DatePickerParts,
    DatePipe,
    DateTimeField,
    DialogParts,
    Field,
    FieldError,
    FieldLabel,
    FormField,
    GreekDateField,
    TimeField,
  ],
  template: `
    <section id="date-entries" class="grid max-w-3xl grid-cols-2 items-start gap-5 p-5">
      <div zzField #birthField="zzField" id="df-birth-field">
        <span zzFieldLabel id="df-birth-label">Date of birth</span>
        <div zzDateField [formField]="dates.birth" locale="en-GB" id="df-birth">
          <div zzDateFieldInput id="df-birth-input"></div>
        </div>
        @if (birthField.state.errorsShown()) {
          @switch (birthField.state.errors()[0]?.kind) {
            @case ("dateIncomplete") {
              <p zzFieldError id="df-birth-error">Enter a complete date</p>
            }
            @case ("dateInvalid") {
              <p zzFieldError id="df-birth-error">This date doesn't exist</p>
            }
            @default {
              <p zzFieldError id="df-birth-error">{{ birthField.state.errors()[0]?.message }}</p>
            }
          }
        }
      </div>
      <div zzDateField [(value)]="usDate" locale="en-US" id="df-en-us">
        <div zzDateFieldInput aria-label="Start date"></div>
      </div>
      <app-greek-date-field />
      <div zzField id="df-readonly-field">
        <span zzFieldLabel>Issued on</span>
        <div zzDateField [formField]="dates.issued" locale="en-GB" id="df-readonly">
          <div zzDateFieldInput></div>
        </div>
      </div>
      <div zzField id="df-disabled-field">
        <span zzFieldLabel>Locked on</span>
        <div zzDateField [formField]="dates.locked" locale="en-GB" id="df-disabled">
          <div zzDateFieldInput></div>
        </div>
      </div>
      <div zzField #invalidField="zzField" id="df-invalid-field">
        <span zzFieldLabel>Registered on</span>
        <div zzDateField [formField]="dates.registered" locale="en-GB" id="df-invalid">
          <div zzDateFieldInput></div>
        </div>
        @if (invalidField.state.errorsShown()) {
          <p zzFieldError id="df-invalid-error">{{ invalidField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzTimeField [(value)]="opensAt" locale="en-US" hourCycle="12" id="tf-12">
        <div zzDateFieldInput aria-label="Opens at"></div>
      </div>
      <output id="tf-12-value">{{ opensAt() }}</output>
      <div
        zzTimeField
        value="17:45:30"
        locale="en-GB"
        hourCycle="24"
        precision="second"
        id="tf-24s"
      >
        <div zzDateFieldInput aria-label="Closes at"></div>
      </div>
      <div zzField id="dtf-field">
        <span zzFieldLabel>Starts at</span>
        <div zzDateTimeField [formField]="dates.startsAt" locale="en-GB" id="dtf">
          <div zzDateFieldInput></div>
        </div>
      </div>
      <div class="grid gap-2">
        <div
          zzDateField
          [(value)]="clearDate"
          locale="en-GB"
          #clearField="zzDateField"
          id="df-clear"
        >
          <div zzDateFieldInput aria-label="Reminder date"></div>
        </div>
        <button zzButton (click)="clearField.clear()" id="df-clear-button">Clear</button>
      </div>

      <div zzField #dueField="zzField" id="dp-field-field">
        <span zzFieldLabel id="dp-field-label">Due date</span>
        <div zzDatePicker [formField]="dates.due" locale="en-GB" id="dp-field">
          <div zzDateFieldInput id="dp-field-input">
            <button zzDatePickerTrigger aria-label="Choose due date" id="dp-field-trigger"></button>
          </div>
          <div
            zzDatePickerContent
            align="end"
            #dueContent="zzDatePickerContent"
            id="dp-field-content"
          >
            @if (dueContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
                id="dp-field-calendar"
              ></div>
            }
          </div>
        </div>
        @if (dueField.state.errorsShown()) {
          <p zzFieldError id="dp-field-error">{{ dueField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzDatePicker readonly value="2026-10-14" locale="en-GB" id="dp-field-readonly">
        <div zzDateFieldInput aria-label="Signed on">
          <button zzDatePickerTrigger aria-label="Choose signing date"></button>
        </div>
        <div zzDatePickerContent align="end" #signedContent="zzDatePickerContent">
          @if (signedContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzDatePicker disabled value="2026-10-14" locale="en-GB" id="dp-field-disabled">
        <div zzDateFieldInput aria-label="Closed on">
          <button zzDatePickerTrigger aria-label="Choose closing date"></button>
        </div>
        <div zzDatePickerContent align="end" #closedContent="zzDatePickerContent">
          @if (closedContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzDatePicker disabled value="2026-10-14" locale="en-GB" id="dp-field-disabled-focusable">
        <div zzDateFieldInput aria-label="Archived on">
          <button
            zzDatePickerTrigger
            focusableWhenDisabled
            aria-label="Choose archiving date"
          ></button>
        </div>
        <div zzDatePickerContent align="end" #archivedContent="zzDatePickerContent">
          @if (archivedContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzDatePicker value="2026-10-14" locale="en-GB" id="dp-field-trigger-disabled">
        <div zzDateFieldInput aria-label="Reviewed on">
          <button zzDatePickerTrigger disabled aria-label="Choose review date"></button>
        </div>
        <div zzDatePickerContent align="end" #reviewedContent="zzDatePickerContent">
          @if (reviewedContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>

      <div zzField id="dp-button-field">
        <span zzFieldLabel id="dp-button-label">Valid until</span>
        <div zzDatePicker [formField]="dates.validUntil" #validUntil="zzDatePicker" id="dp-button">
          <button zzDatePickerTrigger id="dp-button-trigger">
            {{ (validUntil.state.value() | date: "d MMM y") ?? "Choose a date" }}
          </button>
          <div zzDatePickerContent #validUntilContent="zzDatePickerContent" id="dp-button-content">
            @if (validUntilContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
                id="dp-button-calendar"
              ></div>
            }
          </div>
        </div>
      </div>
      <div zzDatePicker [(value)]="emptyDate" #empty="zzDatePicker" id="dp-button-empty">
        <button zzDatePickerTrigger id="dp-button-empty-trigger">
          {{ (empty.state.value() | date: "d MMM y") ?? "Choose a date" }}
        </button>
        <div zzDatePickerContent #emptyContent="zzDatePickerContent">
          @if (emptyContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      @for (specimen of buttonSpecimens; track specimen.id) {
        <div
          zzDatePicker
          [readonly]="specimen.readonly"
          [disabled]="specimen.disabled"
          value="2026-10-14"
          (valueChange)="policyWrites.set(policyWrites() + 1)"
          [id]="specimen.id"
        >
          <button zzDatePickerTrigger [focusableWhenDisabled]="specimen.focusable">
            14 Oct 2026
          </button>
          <div zzDatePickerContent #policyContent="zzDatePickerContent">
            @if (policyContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      }
      <output id="dp-policy-writes">{{ policyWrites() }}</output>
      <div zzField id="dp-button-readonly-schema-field">
        <span zzFieldLabel>Valid from</span>
        <div
          zzDatePicker
          [formField]="dates.validFrom"
          #validFrom="zzDatePicker"
          id="dp-button-readonly-schema"
        >
          <button zzDatePickerTrigger>
            {{ (validFrom.state.value() | date: "d MMM y") ?? "Choose a date" }}
          </button>
          <div zzDatePickerContent #validFromContent="zzDatePickerContent">
            @if (validFromContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>

      <div zzDialog>
        <button zzDialogTrigger id="dp-dialog-trigger">Edit appointment</button>
        <dialog zzDialogContent id="dp-dialog-content">
          <div zzDialogHeader>
            <h2 zzDialogTitle>Edit appointment</h2>
          </div>
          <div zzDialogBody>
            <div class="grid gap-4">
              <div zzField>
                <span zzFieldLabel>Appointment date</span>
                <div zzDatePicker [(value)]="appointment" locale="en-GB" id="dp-dialog">
                  <div zzDateFieldInput>
                    <button zzDatePickerTrigger aria-label="Choose appointment date"></button>
                  </div>
                  <div zzDatePickerContent align="end" #appointmentContent="zzDatePickerContent">
                    @if (appointmentContent.state.open()) {
                      <div
                        zzCalendar
                        today="2026-10-27"
                        [weekStart]="1"
                        selectedDescription="selected"
                      ></div>
                    }
                  </div>
                </div>
              </div>
              <div zzField>
                <span zzFieldLabel>Search from</span>
                <div zzDatePicker [(value)]="searchFrom" #from="zzDatePicker" id="dp-dialog-button">
                  <button zzDatePickerTrigger>
                    {{ (from.state.value() | date: "d MMM y") ?? "Choose a date" }}
                  </button>
                  <div zzDatePickerContent #fromContent="zzDatePickerContent">
                    @if (fromContent.state.open()) {
                      <div
                        zzCalendar
                        today="2026-10-27"
                        [weekStart]="1"
                        selectedDescription="selected"
                      ></div>
                    }
                  </div>
                </div>
              </div>
            </div>
          </div>
        </dialog>
      </div>

      <div dir="rtl">
        <div zzDatePicker value="2026-10-27" locale="en-GB" id="dp-rtl">
          <div zzDateFieldInput aria-label="Delivery date">
            <button zzDatePickerTrigger aria-label="Choose delivery date"></button>
          </div>
          <div zzDatePickerContent align="end" #deliveryContent="zzDatePickerContent">
            @if (deliveryContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
      <div class="light grid gap-2 bg-background p-2">
        <div zzDatePicker value="2026-10-27" locale="en-GB" id="dp-light">
          <div zzDateFieldInput aria-label="Shipping date">
            <button zzDatePickerTrigger aria-label="Choose shipping date"></button>
          </div>
          <div zzDatePickerContent align="end" #shippingContent="zzDatePickerContent">
            @if (shippingContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        <div zzDatePicker #lightButton="zzDatePicker" id="dp-light-button">
          <button zzDatePickerTrigger>
            {{ (lightButton.state.value() | date: "d MMM y") ?? "Choose a date" }}
          </button>
          <div zzDatePickerContent #lightContent="zzDatePickerContent">
            @if (lightContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
})
export class DateEntries {
  protected readonly usDate = signal<string | null>(null);
  protected readonly opensAt = signal<string | null>(null);
  protected readonly clearDate = signal<string | null>("2026-10-14");
  protected readonly emptyDate = signal<string | null>(null);
  protected readonly appointment = signal<string | null>(null);
  protected readonly searchFrom = signal<string | null>(null);
  protected readonly policyWrites = signal(0);
  protected readonly buttonSpecimens = [
    { id: "dp-button-readonly-direct", readonly: true, disabled: false, focusable: false },
    { id: "dp-button-disabled", readonly: false, disabled: true, focusable: false },
    { id: "dp-button-readonly-disabled", readonly: true, disabled: true, focusable: false },
    {
      id: "dp-button-readonly-disabled-focusable",
      readonly: true,
      disabled: true,
      focusable: true,
    },
  ];
  protected readonly dates = form(
    signal({
      birth: null as string | null,
      issued: "2026-10-14" as string | null,
      locked: "2026-10-14" as string | null,
      registered: "1899-12-31" as string | null,
      startsAt: null as string | null,
      due: "2026-10-27" as string | null,
      validUntil: "2026-10-27" as string | null,
      validFrom: "2026-10-14" as string | null,
    }),
    (path) => {
      required(path.birth, { message: "Enter your date of birth." });
      readonly(path.issued);
      disabled(path.locked);
      validate(path.registered, ({ value }) => {
        const date = value();

        if (date !== null && date < "1900-01-01") {
          return { kind: "tooEarly", message: "Enter a date from 1900." };
        }

        return undefined;
      });
      required(path.due, { message: "Choose a due date." });
      readonly(path.validFrom);
    },
  );
}

// DatePickerMultiple, DatePickerRange, MonthPicker and DateTimePicker. The light looks come from
// `.light` on the section, which the smoke adds at runtime.
@Component({
  selector: "app-more-date-pickers",
  imports: [
    Button,
    DatePickerMultipleParts,
    DatePickerRangeParts,
    DatePipe,
    DateTimePickerParts,
    DialogParts,
    Field,
    FieldError,
    FieldLabel,
    FormField,
    MonthPickerParts,
  ],
  template: `
    <section id="more-date-pickers" class="grid max-w-3xl grid-cols-2 items-start gap-5 p-5">
      <div zzField id="dpm-field">
        <span zzFieldLabel>Holidays</span>
        <div
          zzDatePickerMultiple
          [formField]="more.holidays"
          [(open)]="holidaysOpen"
          #holidays="zzDatePickerMultiple"
          id="dpm"
        >
          <button zzDatePickerTrigger>
            @switch (holidays.state.value().length) {
              @case (0) {
                Choose days
              }
              @case (1) {
                1 day
              }
              @default {
                {{ holidays.state.value().length }} days
              }
            }
          </button>
          <div zzDatePickerContent #content="zzDatePickerContent">
            @if (content.state.open()) {
              <div
                zzCalendarMultiple
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
              <div zzDatePickerFooter>
                <button zzButton size="sm" (click)="holidaysOpen.set(false)" id="dpm-done">
                  Done
                </button>
              </div>
            }
          </div>
        </div>
      </div>
      <div
        zzDatePickerMultiple
        [(value)]="noDays"
        #noDaysPicker="zzDatePickerMultiple"
        id="dpm-empty"
      >
        <button zzDatePickerTrigger>
          @if (noDaysPicker.state.value().length === 0) {
            Choose days
          } @else {
            {{ noDaysPicker.state.value().length }} days
          }
        </button>
        <div zzDatePickerContent #noDaysContent="zzDatePickerContent">
          @if (noDaysContent.state.open()) {
            <div
              zzCalendarMultiple
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>
      <!-- The list text (D3-B) truncates in 200px. -->
      <div class="w-50 max-w-full">
        <div zzDatePickerMultiple [value]="listDays" #list="zzDatePickerMultiple" id="dpm-list">
          <button zzDatePickerTrigger>
            @for (day of list.state.value(); track day; let last = $last) {
              {{ day | date: "d MMM" }}{{ last ? "" : ", " }}
            }
          </button>
          <div zzDatePickerContent #listContent="zzDatePickerContent">
            @if (listContent.state.open()) {
              <div
                zzCalendarMultiple
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
      <div zzDatePickerMultiple [value]="crossDays" #cross="zzDatePickerMultiple" id="dpm-cross">
        <button zzDatePickerTrigger>{{ cross.state.value().length }} days</button>
        <div zzDatePickerContent #crossContent="zzDatePickerContent">
          @if (crossContent.state.open()) {
            <div
              zzCalendarMultiple
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>
      <div zzDatePickerMultiple readonly [value]="oneDay" id="dpm-readonly">
        <button zzDatePickerTrigger>1 day</button>
        <div zzDatePickerContent #readonlyDaysContent="zzDatePickerContent">
          @if (readonlyDaysContent.state.open()) {
            <div
              zzCalendarMultiple
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>
      <div zzDatePickerMultiple disabled [value]="oneDay" id="dpm-disabled">
        <button zzDatePickerTrigger>1 day</button>
        <div zzDatePickerContent #disabledDaysContent="zzDatePickerContent">
          @if (disabledDaysContent.state.open()) {
            <div
              zzCalendarMultiple
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>

      <div zzField #stayField="zzField" id="dpr-field">
        <span zzFieldLabel>Stay</span>
        <div zzDatePickerRange [formField]="more.stay" #stay="zzDatePickerRange" id="dpr">
          <button zzDatePickerTrigger>
            @if (stay.state.value(); as range) {
              {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
            } @else {
              Choose dates
            }
          </button>
          <div zzDatePickerContent #stayContent="zzDatePickerContent">
            @if (stayContent.state.open()) {
              <div
                zzCalendarRange
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        @if (stayField.state.errorsShown()) {
          <p zzFieldError>{{ stayField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzField #checkInField="zzField" id="dpr-required-field">
        <span zzFieldLabel>Check-in</span>
        <div
          zzDatePickerRange
          [formField]="more.checkIn"
          #checkIn="zzDatePickerRange"
          id="dpr-required"
        >
          <button zzDatePickerTrigger>
            @if (checkIn.state.value(); as range) {
              {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
            } @else {
              Choose dates
            }
          </button>
          <div zzDatePickerContent #checkInContent="zzDatePickerContent">
            @if (checkInContent.state.open()) {
              <div
                zzCalendarRange
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        @if (checkInField.state.errorsShown()) {
          <p zzFieldError id="dpr-required-error">{{ checkInField.state.errors()[0]?.message }}</p>
        }
      </div>
      <div zzDatePickerRange [(value)]="noRange" #noRangePicker="zzDatePickerRange" id="dpr-empty">
        <button zzDatePickerTrigger>
          @if (noRangePicker.state.value(); as range) {
            {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
          } @else {
            Choose dates
          }
        </button>
        <div zzDatePickerContent #noRangeContent="zzDatePickerContent">
          @if (noRangeContent.state.open()) {
            <div
              zzCalendarRange
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>
      <!-- A range across three months truncates in 160px. -->
      <div class="w-40 max-w-full">
        <div zzDatePickerRange [value]="crossRange" #crossStay="zzDatePickerRange" id="dpr-cross">
          <button zzDatePickerTrigger>
            @if (crossStay.state.value(); as range) {
              {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
            }
          </button>
          <div zzDatePickerContent #crossStayContent="zzDatePickerContent">
            @if (crossStayContent.state.open()) {
              <div
                zzCalendarRange
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
      <div zzField id="dpr-readonly-schema-field">
        <span zzFieldLabel>Booked stay</span>
        <div
          zzDatePickerRange
          [formField]="more.bookedStay"
          #booked="zzDatePickerRange"
          id="dpr-readonly-schema"
        >
          <button zzDatePickerTrigger>
            @if (booked.state.value(); as range) {
              {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
            }
          </button>
          <div zzDatePickerContent #bookedContent="zzDatePickerContent">
            @if (bookedContent.state.open()) {
              <div
                zzCalendarRange
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
      <div zzDatePickerRange disabled [value]="novemberStay" id="dpr-disabled-focusable">
        <button zzDatePickerTrigger focusableWhenDisabled>3 Nov 2026 – 10 Nov 2026</button>
        <div zzDatePickerContent #disabledStayContent="zzDatePickerContent">
          @if (disabledStayContent.state.open()) {
            <div
              zzCalendarRange
              today="2026-10-27"
              [weekStart]="1"
              selectedDescription="selected"
            ></div>
          }
        </div>
      </div>
      <div zzDialog>
        <button zzDialogTrigger id="dpr-dialog-trigger">Edit stay</button>
        <dialog zzDialogContent id="dpr-dialog-content">
          <div zzDialogHeader>
            <h2 zzDialogTitle>Edit stay</h2>
          </div>
          <div zzDialogBody>
            <div
              zzDatePickerRange
              [(value)]="dialogStay"
              #dialogRange="zzDatePickerRange"
              id="dpr-dialog"
            >
              <button zzDatePickerTrigger>
                @if (dialogRange.state.value(); as range) {
                  {{ range.start | date: "d MMM y" }} – {{ range.end | date: "d MMM y" }}
                } @else {
                  Choose dates
                }
              </button>
              <div zzDatePickerContent #dialogRangeContent="zzDatePickerContent">
                @if (dialogRangeContent.state.open()) {
                  <div
                    zzCalendarRange
                    today="2026-10-27"
                    [weekStart]="1"
                    selectedDescription="selected"
                  ></div>
                }
              </div>
            </div>
          </div>
        </dialog>
      </div>

      <div zzField id="dmp-field">
        <span zzFieldLabel>Billing month</span>
        <div zzMonthPicker [formField]="more.billing" #billing="zzMonthPicker" id="dmp">
          <button zzDatePickerTrigger>
            {{ (billing.state.value() | date: "MMMM y") ?? "Choose a month" }}
          </button>
          <div zzDatePickerContent #billingContent="zzDatePickerContent">
            @if (billingContent.state.open()) {
              <div
                zzMonthCalendar
                today="2026-10-27"
                maxMonth="2026-12"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
      </div>
      <div zzMonthPicker [(value)]="noMonth" #noMonthPicker="zzMonthPicker" id="dmp-empty">
        <button zzDatePickerTrigger>
          {{ (noMonthPicker.state.value() | date: "MMMM y") ?? "Choose a month" }}
        </button>
        <div zzDatePickerContent #noMonthContent="zzDatePickerContent">
          @if (noMonthContent.state.open()) {
            <div zzMonthCalendar today="2026-10-27" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzMonthPicker readonly disabled value="2026-10" id="dmp-readonly-disabled">
        <button zzDatePickerTrigger>October 2026</button>
        <div zzDatePickerContent #lockedMonthContent="zzDatePickerContent">
          @if (lockedMonthContent.state.open()) {
            <div zzMonthCalendar today="2026-10-27" selectedDescription="selected"></div>
          }
        </div>
      </div>

      <div zzField #starts="zzField" id="dtp-field">
        <span zzFieldLabel>Starts at</span>
        <div zzDateTimePicker [formField]="more.startsAt" locale="en-GB" id="dtp">
          <div zzDateFieldInput>
            <button zzDatePickerTrigger aria-label="Choose start date"></button>
          </div>
          <div zzDatePickerContent align="end" #startsContent="zzDatePickerContent">
            @if (startsContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        @if (starts.state.errorsShown()) {
          @switch (starts.state.errors()[0]?.kind) {
            @case ("dateTimeIncomplete") {
              <p zzFieldError>Enter a complete date and time</p>
            }
            @case ("dateInvalid") {
              <p zzFieldError>This date doesn't exist</p>
            }
            @default {
              <p zzFieldError>{{ starts.state.errors()[0]?.message }}</p>
            }
          }
        }
      </div>
      <div zzField #meeting="zzField" id="dtp-empty-field">
        <span zzFieldLabel>Meeting</span>
        <div zzDateTimePicker [formField]="more.meeting" locale="en-GB" id="dtp-empty">
          <div zzDateFieldInput>
            <button zzDatePickerTrigger aria-label="Choose meeting date"></button>
          </div>
          <div zzDatePickerContent align="end" #meetingContent="zzDatePickerContent">
            @if (meetingContent.state.open()) {
              <div
                zzCalendar
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        @if (meeting.state.errorsShown()) {
          @switch (meeting.state.errors()[0]?.kind) {
            @case ("dateTimeIncomplete") {
              <p zzFieldError>Enter a complete date and time</p>
            }
            @case ("dateInvalid") {
              <p zzFieldError>This date doesn't exist</p>
            }
            @default {
              <p zzFieldError>{{ meeting.state.errors()[0]?.message }}</p>
            }
          }
        }
      </div>
      <div zzDateTimePicker [(value)]="reminder" locale="en-US" hourCycle="12" id="dtp-12">
        <div zzDateFieldInput aria-label="Reminder">
          <button zzDatePickerTrigger aria-label="Choose reminder date"></button>
        </div>
        <div zzDatePickerContent align="end" #reminderContent="zzDatePickerContent">
          @if (reminderContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzDateTimePicker readonly value="2026-10-27T09:30" locale="en-GB" id="dtp-readonly">
        <div zzDateFieldInput aria-label="Signed at">
          <button zzDatePickerTrigger aria-label="Choose signing date"></button>
        </div>
        <div zzDatePickerContent align="end" #signedAtContent="zzDatePickerContent">
          @if (signedAtContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>
      <div zzDateTimePicker disabled value="2026-10-27T09:30" locale="en-GB" id="dtp-disabled">
        <div zzDateFieldInput aria-label="Closed at">
          <button zzDatePickerTrigger aria-label="Choose closing date"></button>
        </div>
        <div zzDatePickerContent align="end" #closedAtContent="zzDatePickerContent">
          @if (closedAtContent.state.open()) {
            <div zzCalendar today="2026-10-27" [weekStart]="1" selectedDescription="selected"></div>
          }
        </div>
      </div>

      <div dir="rtl" class="col-span-2 grid grid-cols-2 gap-5">
        <div zzDatePickerRange [value]="novemberStay" id="dpr-rtl">
          <button zzDatePickerTrigger>3 Nov 2026 – 10 Nov 2026</button>
          <div zzDatePickerContent #rtlRangeContent="zzDatePickerContent">
            @if (rtlRangeContent.state.open()) {
              <div
                zzCalendarRange
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
            }
          </div>
        </div>
        <div zzDatePickerMultiple [value]="oneDay" [(open)]="rtlDaysOpen" id="dpm-rtl">
          <button zzDatePickerTrigger>1 day</button>
          <div zzDatePickerContent #rtlDaysContent="zzDatePickerContent">
            @if (rtlDaysContent.state.open()) {
              <div
                zzCalendarMultiple
                today="2026-10-27"
                [weekStart]="1"
                selectedDescription="selected"
              ></div>
              <div zzDatePickerFooter>
                <button zzButton size="sm" (click)="rtlDaysOpen.set(false)">Done</button>
              </div>
            }
          </div>
        </div>
      </div>

      <div class="col-span-2 grid gap-1 text-label text-muted-foreground">
        <output id="more-holidays">{{ json(more.holidays().value()) }}</output>
        <output id="more-holidays-touched">{{ more.holidays().touched() }}</output>
        <output id="more-stay">{{ json(more.stay().value()) }}</output>
        <output id="more-billing">{{ json(more.billing().value()) }}</output>
        <output id="more-starts">{{ json(more.startsAt().value()) }}</output>
        <output id="more-meeting">{{ json(more.meeting().value()) }}</output>
        <output id="dtp-12-value">{{ json(reminder()) }}</output>
      </div>
    </section>
  `,
})
export class MoreDatePickers {
  protected readonly json = JSON.stringify;
  protected readonly holidaysOpen = signal(false);
  protected readonly rtlDaysOpen = signal(false);
  protected readonly noDays = signal<readonly string[]>([]);
  protected readonly noRange = signal<OrigamiDateRange | null>(null);
  protected readonly dialogStay = signal<OrigamiDateRange | null>(null);
  protected readonly noMonth = signal<string | null>(null);
  protected readonly reminder = signal<string | null>(null);
  protected readonly listDays = [
    "2026-11-03",
    "2026-11-10",
    "2026-11-17",
    "2026-11-24",
    "2026-12-01",
    "2026-12-08",
  ];
  protected readonly crossDays = ["2026-11-03", "2026-12-10", "2027-01-17"];
  protected readonly oneDay = ["2026-11-03"];
  protected readonly crossRange: OrigamiDateRange = { start: "2026-11-20", end: "2027-01-12" };
  protected readonly novemberStay: OrigamiDateRange = { start: "2026-11-03", end: "2026-11-10" };
  protected readonly more = form(
    signal({
      holidays: ["2026-11-03", "2026-11-10", "2026-11-17"] as readonly string[],
      stay: { start: "2026-11-03", end: "2026-11-10" } as OrigamiDateRange | null,
      checkIn: null as OrigamiDateRange | null,
      bookedStay: { start: "2026-11-03", end: "2026-11-10" } as OrigamiDateRange | null,
      billing: "2026-10" as string | null,
      startsAt: "2026-10-27T09:30" as string | null,
      meeting: null as string | null,
    }),
    (path) => {
      required(path.stay, { message: "Choose your dates" });
      required(path.checkIn, { message: "Choose your dates" });
      required(path.startsAt);
      readonly(path.bookedStay);
    },
  );
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
          <p zzFileFieldValue id="file-button-value">
            <button
              zzFileFieldClear
              aria-label="Remove the invoice"
              class="md:inline-flex"
              id="file-button-clear"
            ></button>
          </p>
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
          <p zzFileFieldValue id="file-zone-value">
            <button
              zzFileFieldClear
              aria-label="Remove the attachment"
              id="file-zone-clear"
            ></button>
          </p>
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
        <p zzFileFieldValue id="file-locked-button-value">
          <button
            zzFileFieldClear
            aria-label="Remove the locked file"
            id="file-locked-button-clear"
          ></button>
        </p>
      </div>
      <button zzButton type="button" (click)="fillLocked()" id="file-locked-fill">
        Fill the locked field
      </button>

      <div class="flex items-center gap-2">
        <div zzFileField [(value)]="logo" id="file-primary-root">
          <label zzFileFieldButton variant="primary" size="sm" id="file-primary">
            Upload logo <input zzFileFieldInput accept="image/*" id="file-primary-input" />
          </label>
          <p zzFileFieldValue id="file-primary-value">
            <button zzFileFieldClear aria-label="Remove the logo" id="file-primary-clear"></button>
          </p>
        </div>
      </div>

      <div zzFileField [(value)]="statement" class="w-60" id="file-narrow">
        <label zzFileFieldButton size="sm" id="file-narrow-button">
          Choose <input zzFileFieldInput id="file-narrow-input" />
        </label>
        <p zzFileFieldValue id="file-narrow-value"></p>
      </div>

      <div zzFileField [(value)]="narrowStatement" class="w-55" id="file-narrow-clear-root">
        <label zzFileFieldButton id="file-narrow-clear-button">
          <svg lucideUpload></svg> Choose file
          <input zzFileFieldInput id="file-narrow-clear-input" />
        </label>
        <p zzFileFieldValue id="file-narrow-clear-value">
          <button
            zzFileFieldClear
            aria-label="Remove the statement"
            id="file-narrow-clear"
          ></button>
        </p>
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
  protected readonly narrowStatement = signal<File | null>(null);
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

// Toggle, ToggleGroup and Toolbar: every Toggle state and size, standalone segmented controls
// (indicator, Multiple, vertical, root-disabled, Signal Forms, a nested root), and Toolbars with
// every control, at full width, at 360px, with a long radio label, vertical and right to left.
@Component({
  selector: "app-toggles",
  imports: [
    Button,
    Field,
    FieldLabel,
    FormField,
    LucideBell,
    LucideBold,
    LucideChevronDown,
    LucideCopy,
    LucideItalic,
    LucidePin,
    LucideRedo2,
    LucideUndo2,
    LucideWrapText,
    MenuParts,
    PopoverParts,
    RadioGroupItem,
    Toggle,
    ToggleGroupParts,
    ToolbarParts,
    TooltipParts,
  ],
  template: `
    <section id="toggles" class="grid gap-6 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <button zzToggle [(checked)]="mute" id="toggle-mute">Mute</button>
        <button
          zzToggle
          size="icon"
          aria-label="Pin to sidebar"
          [(checked)]="pinned"
          id="toggle-pin"
        >
          <svg lucidePin aria-hidden="true"></svg>
        </button>
        <button zzToggle size="sm" [(checked)]="wrap" id="toggle-wrap">
          <svg lucideWrapText aria-hidden="true"></svg> Wrap
        </button>
        <button zzToggle size="lg" [checked]="true" id="toggle-lg">Bold</button>
        <button zzToggle [(checked)]="unreadOnly" id="toggle-count">
          Unread <span class="text-muted-foreground" id="toggle-count-span">12</span>
        </button>
        <button zzToggle disabled id="toggle-off-disabled">Off</button>
        <button zzToggle [checked]="true" disabled id="toggle-on-disabled">On</button>
        <button
          zzToggle
          [checked]="true"
          (checkedChange)="lockedChanges.set(lockedChanges() + 1)"
          disabled
          focusableWhenDisabled
          id="toggle-focusable-disabled"
        >
          Locked
        </button>
        <div zzField orientation="horizontal">
          <button zzToggle [formField]="controls.notify" size="icon" id="toggle-form">
            <svg lucideBell aria-hidden="true"></svg>
          </button>
          <label zzFieldLabel id="toggle-form-label">Notify me</label>
        </div>
      </div>
      <output id="toggle-result"
        >{{ mute() }} {{ controls.notify().value() }} {{ controls.notify().touched() }}
        {{ lockedChanges() }}</output
      >

      <div class="flex flex-wrap items-start gap-4">
        <div zzToggleGroupSingle [(value)]="status" indicator aria-label="Status" id="tg-status">
          <button zzToggleGroupItem value="all" id="seg-all">All</button>
          <button zzToggleGroupItem value="active" id="seg-active">Active</button>
          <button zzToggleGroupItem value="ending" id="seg-ending">Ending</button>
          <button zzToggleGroupItem value="overdue" disabled id="seg-overdue">Overdue</button>
        </div>
        <div zzToggleGroupMultiple [(value)]="marks" aria-label="Text style" id="tg-marks">
          <button zzToggleGroupItem value="bold" aria-label="Bold" id="tg-bold">
            <svg lucideBold aria-hidden="true"></svg>
          </button>
          <button zzToggleGroupItem value="italic" aria-label="Italic" id="tg-italic">
            <svg lucideItalic aria-hidden="true"></svg>
          </button>
          <button zzToggleGroupItem value="underline" aria-label="Underline" id="tg-underline">
            U
          </button>
        </div>
        <div
          zzToggleGroupSingle
          orientation="vertical"
          deselectable
          [(value)]="density"
          aria-label="Density"
          id="tg-density"
        >
          <button zzToggleGroupItem value="compact" id="density-compact">Compact</button>
          <button zzToggleGroupItem value="comfortable" id="density-comfortable">
            Comfortable
          </button>
          <span zzTooltip>
            <button zzToggleGroupItem zzTooltipTrigger value="spacious" id="density-spacious">
              Spacious
            </button>
            <span zzTooltipContent>Most room between rows</span>
          </span>
        </div>
        <div
          zzToggleGroupSingle
          value="all"
          disabled
          indicator
          aria-label="Disabled status"
          id="tg-disabled"
        >
          <button zzToggleGroupItem value="all" id="tg-disabled-all">All</button>
          <button zzToggleGroupItem value="active">Active</button>
        </div>
        <div zzField>
          <span zzFieldLabel>Billing</span>
          <div
            zzToggleGroupSingle
            [formField]="controls.billing"
            aria-label="Billing"
            id="tg-billing"
          >
            <button zzToggleGroupItem value="monthly" id="billing-monthly">Monthly</button>
            <button zzToggleGroupItem value="annual" id="billing-annual">Annual</button>
          </div>
        </div>
        <button zzButton (click)="controls.billing().focusBoundControl()" id="focus-billing">
          Focus billing
        </button>
        <!-- The inner root sits inside the outer indicator root, outside any item. -->
        <div zzToggleGroupSingle indicator value="outer" aria-label="Outer group" id="tg-outer">
          <button zzToggleGroupItem value="outer" id="tg-outer-item">Outer</button>
          <div>
            <div zzToggleGroupSingle value="inner" aria-label="Nested group" id="tg-nested">
              <button zzToggleGroupItem value="inner" id="tg-nested-item">Inner</button>
            </div>
          </div>
        </div>
      </div>
      <output id="tg-result"
        >{{ status() ?? "none" }} {{ marks().join(",") }} {{ density() ?? "none" }}</output
      >

      <div zzToolbar aria-label="Formatting" id="toolbar">
        <button zzToolbarButton size="icon" aria-label="Undo" id="tb-undo">
          <svg lucideUndo2 aria-hidden="true"></svg>
        </button>
        <button
          zzToolbarButton
          size="icon"
          aria-label="Redo"
          [disabled]="!canRedo()"
          focusableWhenDisabled
          (click)="canRedo() && redo()"
          id="tb-redo"
        >
          <svg lucideRedo2 aria-hidden="true"></svg>
        </button>
        <div zzToolbarSeparator id="tb-sep-1"></div>
        <div
          zzToolbarToggleGroupMultiple
          [(value)]="toolbarMarks"
          aria-label="Text style"
          id="tb-marks"
        >
          <button zzToggleGroupItem value="bold" aria-label="Bold" id="tb-bold">
            <svg lucideBold aria-hidden="true"></svg>
          </button>
          <button zzToggleGroupItem value="italic" aria-label="Italic" id="tb-italic">
            <svg lucideItalic aria-hidden="true"></svg>
          </button>
        </div>
        <div zzToolbarSeparator></div>
        <button zzToolbarToggle [(checked)]="spellcheck" id="tb-spell">Spell check</button>
        <div
          zzToolbarToggleGroupSingle
          [(value)]="view"
          deselectable
          indicator
          aria-label="Period"
          id="tb-view"
        >
          <button zzToggleGroupItem value="week" id="tb-week">Week</button>
          <button zzToggleGroupItem value="month" id="tb-month">Month</button>
        </div>
        <div zzToolbarRadioGroup [(value)]="alignment" aria-label="Alignment" id="tb-align">
          <button zzRadioGroupItem value="left" id="tb-left">Left</button>
          <span zzTooltip [openDelay]="0">
            <button zzRadioGroupItem zzTooltipTrigger value="center" id="tb-center">Center</button>
            <span zzTooltipContent id="tb-center-tooltip">Centers the paragraph</span>
          </span>
          <button zzRadioGroupItem value="right" id="tb-right">Right</button>
        </div>
        <div zzPopover>
          <button zzToolbarPopoverTrigger id="tb-symbol">Symbol</button>
          <div zzPopoverContent aria-label="Symbols" id="tb-symbol-content">
            <button zzButton id="tb-symbol-star">★ Star</button>
          </div>
        </div>
        <div zzMenu>
          <button zzToolbarMenuTrigger id="tb-more">
            More <svg lucideChevronDown aria-hidden="true"></svg>
          </button>
          <div zzMenuContent id="tb-more-content">
            <button zzMenuItem (select)="cleared.set(true)" id="tb-clear">Clear formatting</button>
          </div>
        </div>
        <span zzTooltip>
          <button zzToolbarButton zzTooltipTrigger size="icon" aria-label="Copy" id="tb-copy">
            <svg lucideCopy aria-hidden="true"></svg>
          </button>
          <span zzTooltipContent id="tb-copy-tooltip">Copies the link</span>
        </span>
      </div>
      <output id="tb-result"
        >{{ spellcheck() }} {{ alignment() ?? "none" }} {{ view() ?? "none" }} {{ redoRuns() }}
        {{ cleared() }} {{ toolbarMarks().join(",") }}</output
      >

      <div class="w-[360px]">
        <div zzToolbar aria-label="Narrow formatting" id="toolbar-narrow">
          <button zzToolbarButton size="icon" aria-label="Undo" id="n-undo">
            <svg lucideUndo2 aria-hidden="true"></svg>
          </button>
          <button zzToolbarButton size="icon" aria-label="Redo" id="n-redo">
            <svg lucideRedo2 aria-hidden="true"></svg>
          </button>
          <div zzToolbarSeparator></div>
          <div zzToolbarToggleGroupMultiple [value]="['bold']" aria-label="Text style" id="n-marks">
            <button zzToggleGroupItem value="bold" aria-label="Bold">
              <svg lucideBold aria-hidden="true"></svg>
            </button>
            <button zzToggleGroupItem value="italic" aria-label="Italic">
              <svg lucideItalic aria-hidden="true"></svg>
            </button>
            <button zzToggleGroupItem value="underline" aria-label="Underline">U</button>
          </div>
          <div zzToolbarSeparator></div>
          <button zzToolbarToggle [checked]="true" id="n-spell">Spell check</button>
          <div zzToolbarSeparator></div>
          <div zzToolbarRadioGroup value="center" aria-label="Alignment" id="n-align">
            <button zzRadioGroupItem value="left">Left</button>
            <button zzRadioGroupItem value="center">Center</button>
            <button zzRadioGroupItem value="right">Right</button>
          </div>
          <div zzToolbarSeparator></div>
          <div zzPopover>
            <button zzToolbarPopoverTrigger id="n-symbol">Symbol</button>
            <div zzPopoverContent aria-label="Symbols">★</div>
          </div>
          <div zzMenu>
            <button zzToolbarMenuTrigger id="n-more">More</button>
            <div zzMenuContent>
              <button zzMenuItem>Clear formatting</button>
            </div>
          </div>
          <button zzToolbarButton size="icon" aria-label="Copy" id="n-copy">
            <svg lucideCopy aria-hidden="true"></svg>
          </button>
        </div>
      </div>

      <!-- A long unbreakable label beside breakable ones: every row stays one 32px line. -->
      <div class="w-[360px]">
        <div zzToolbar aria-label="Long alignment" id="toolbar-long">
          <div zzToolbarRadioGroup value="left" aria-label="Alignment" id="long-align">
            <button zzRadioGroupItem value="left" id="long-left">Align left</button>
            <button zzRadioGroupItem value="center" id="long-center">Align center</button>
            <button zzRadioGroupItem value="right" id="long-right">
              AlignRightWithoutBreaking
            </button>
          </div>
        </div>
      </div>

      <div zzToolbar orientation="vertical" aria-label="Vertical formatting" id="toolbar-vertical">
        <button zzToolbarButton size="sm" id="vert-start">Undo</button>
        <div zzToolbarSeparator id="vert-sep"></div>
        <div zzToolbarRadioGroup value="center" aria-label="Alignment" id="vert-align">
          <button zzRadioGroupItem value="left" id="vert-left">Left</button>
          <button zzRadioGroupItem value="center" id="vert-center">Center</button>
        </div>
        <button zzToolbarButton id="vert-end">Options</button>
      </div>

      <div dir="rtl">
        <div zzToolbar aria-label="Right to left" id="toolbar-rtl">
          <button zzToolbarButton id="rtl-first">First</button>
          <button zzToolbarButton id="rtl-second">Second</button>
          <button zzToolbarButton id="rtl-third">Third</button>
        </div>
      </div>
    </section>
  `,
})
export class Toggles {
  protected readonly mute = signal(false);
  protected readonly pinned = signal(false);
  protected readonly wrap = signal(false);
  protected readonly unreadOnly = signal(true);
  protected readonly lockedChanges = signal(0);
  protected readonly status = signal<string | null>("active");
  protected readonly marks = signal<readonly string[]>(["bold", "italic"]);
  protected readonly density = signal<string | null>("compact");
  protected readonly toolbarMarks = signal<readonly string[]>(["bold"]);
  protected readonly spellcheck = signal(true);
  protected readonly alignment = signal<string | null>("center");
  protected readonly view = signal<string | null>("month");
  protected readonly redoRuns = signal(0);
  protected readonly cleared = signal(false);
  protected readonly controls = form(
    signal<{ notify: boolean; billing: string | null }>({ notify: false, billing: "annual" }),
  );

  protected canRedo(): boolean {
    return false;
  }

  protected redo(): void {
    this.redoRuns.set(this.redoRuns() + 1);
  }
}

// A replaced Options whose factory reads the bound, required value: fold's thresholds must not
// resolve Options before Origami's first read, or the prerender throws NG0950.
@Component({
  selector: "[appMeterOptionsProbe]",
  hostDirectives: [
    { directive: OrigamiMeter, inputs: ["value"] },
    { directive: MeterThresholds, inputs: ["low", "high", "optimum"] },
  ],
  providers: [
    OrigamiMeterOptions.provideFactory(() => ({
      value: signal(inject(OrigamiMeter).value()),
      min: signal(0),
      max: signal(200),
      valueText: signal(null),
    })),
  ],
  template: "",
})
export class MeterOptionsProbe {}

// Meter and MeterRing: regions, edges, sizes, live bounds and values, themes, right to left,
// forced colors and the README's recipes. Every root's name is unique on the page.
@Component({
  selector: "app-meters",
  imports: [Button, Meter, MeterOptionsProbe, MeterRing],
  template: `
    <section id="meters" class="grid w-[626px] max-w-full gap-5 bg-surface p-5 text-foreground">
      <h3 id="meter-system-disk-title" class="text-title">System disk</h3>
      <div
        zzMeter
        [value]="72"
        low="60"
        high="85"
        optimum="0"
        aria-labelledby="meter-system-disk-title"
        id="meter-disk-72"
      ></div>
      <div class="flex flex-wrap items-center gap-4">
        <div
          zzMeterRing
          [value]="35"
          low="60"
          high="85"
          optimum="0"
          aria-label="Disk ring 35%"
          id="ring-disk-35"
        ></div>
        <div
          zzMeterRing
          [value]="72"
          low="60"
          high="85"
          optimum="0"
          aria-label="Disk ring"
          id="ring-disk-72"
        ></div>
        <div
          zzMeterRing
          [value]="92"
          low="60"
          high="85"
          optimum="0"
          aria-label="Disk ring 92%"
          id="ring-disk-92"
        ></div>
        <div
          zzMeterRing
          [value]="12"
          [max]="40"
          valueText="12 of 40 seats"
          aria-label="Seats taken"
          id="ring-seats"
        ></div>
        <div zzMeterRing [value]="72" aria-label="Big ring 72%" class="size-32" id="ring-big"></div>
      </div>
      <div zzMeter [value]="42" aria-label="Plain 42%" id="meter-plain"></div>
      <div
        zzMeter
        [value]="35"
        low="60"
        high="85"
        optimum="0"
        aria-label="Disk 35%"
        id="meter-disk-35"
      ></div>
      <div
        zzMeter
        [value]="92"
        low="60"
        high="85"
        optimum="0"
        aria-label="Disk 92%"
        id="meter-disk-92"
      ></div>
      <div zzMeter [value]="72" aria-label="Thick 72%" class="h-4 w-60" id="meter-thick"></div>
      <div
        zzMeter
        [value]="92"
        low="60"
        high="85"
        optimum="0"
        aria-label="Recoloured 92%"
        class="data-[region=worst]:[--meter-fill:var(--destructive-text)]"
        id="meter-recolour"
      ></div>
      <div
        zzMeter
        [value]="15"
        [min]="20"
        [max]="10"
        low="20"
        aria-label="Inverted range"
        id="meter-inverted"
      ></div>
      <div
        zzMeter
        [value]="90"
        [max]="nan"
        low="60"
        high="85"
        optimum="0"
        aria-label="No maximum"
        id="meter-nan-max"
      ></div>
      <div
        appMeterOptionsProbe
        [value]="90"
        low="60"
        high="85"
        aria-label="Options probe"
        id="meter-options"
      ></div>

      <div class="flex flex-wrap items-center gap-4">
        <button zzButton (click)="toggleMaximum()" id="meter-toggle-max">Change maximum</button>
        <button zzButton (click)="toggleLow()" id="meter-toggle-low">Toggle threshold</button>
        <div
          zzMeterRing
          [value]="70"
          [max]="maximum()"
          low="60"
          high="80"
          aria-label="Live maximum"
          id="ring-bounds"
        ></div>
      </div>
      <div
        zzMeter
        [value]="70"
        [low]="singleLow()"
        aria-label="Single threshold"
        id="meter-threshold"
      ></div>

      <div class="grid justify-items-start gap-3" id="meter-arrivals-card">
        <h3 id="meter-arrivals-title" class="text-title">Arrivals</h3>
        @if (arrivals(); as result) {
          <div
            zzMeterRing
            [value]="result.percentage"
            low="40"
            high="70"
            optimum="100"
            aria-labelledby="meter-arrivals-title"
            id="ring-arrivals"
          ></div>
        } @else {
          <p id="meter-arrivals-empty">No arrivals data for this period</p>
        }
        <button zzButton (click)="nextPeriod()" id="meter-next-period">Next period</button>
      </div>

      <div dir="rtl" class="flex items-center gap-4" id="meter-rtl">
        <div
          zzMeter
          [value]="35"
          low="60"
          high="85"
          optimum="0"
          aria-label="Right-to-left disk 35%"
          id="meter-rtl-35"
        ></div>
        <div
          zzMeterRing
          [value]="35"
          low="60"
          high="85"
          optimum="0"
          aria-label="Right-to-left disk ring 35%"
          id="ring-rtl-35"
        ></div>
      </div>

      <div class="light grid gap-4 bg-surface p-4 text-foreground" id="meter-light">
        <div zzMeter [value]="42" aria-label="Light plain 42%" id="meter-light-plain"></div>
        <div
          zzMeter
          [value]="35"
          low="60"
          high="85"
          optimum="0"
          aria-label="Light disk 35%"
          id="meter-light-35"
        ></div>
        <div
          zzMeter
          [value]="72"
          low="60"
          high="85"
          optimum="0"
          aria-label="Light disk 72%"
          id="meter-light-72"
        ></div>
        <div
          zzMeter
          [value]="92"
          low="60"
          high="85"
          optimum="0"
          aria-label="Light disk 92%"
          id="meter-light-92"
        ></div>
        <div
          zzMeterRing
          [value]="35"
          low="60"
          high="85"
          optimum="0"
          aria-label="Light disk ring 35%"
          id="ring-light-35"
        ></div>
      </div>

      <div
        class="flex items-center gap-4 bg-muted p-4 forced-color-adjust-none"
        id="meter-forced-panel"
      >
        <div
          zzMeter
          [value]="92"
          low="60"
          high="85"
          optimum="0"
          aria-label="Forced disk 92%"
          id="meter-forced-92"
        ></div>
        <div
          zzMeterRing
          [value]="92"
          low="60"
          high="85"
          optimum="0"
          aria-label="Forced disk ring 92%"
          id="ring-forced-92"
        ></div>
      </div>

      <div class="grid gap-2">
        <div class="flex items-baseline justify-between gap-3">
          <h3 id="meter-recipe-title" class="text-title">Disk capacity</h3>
          <span aria-hidden="true" class="tabular-nums" id="meter-recipe-text">{{
            diskText()
          }}</span>
        </div>
        <div
          zzMeter
          [value]="disk().used"
          low="60"
          high="85"
          optimum="0"
          [valueText]="diskText()"
          aria-labelledby="meter-recipe-title"
          id="meter-recipe"
        ></div>
      </div>
    </section>
  `,
})
export class Meters {
  protected readonly nan = NaN;
  protected readonly maximum = signal(100);
  protected readonly singleLow = signal<number | undefined>(65);
  protected readonly disk = signal({ used: 92 });
  protected readonly diskText = computed(() => `${this.disk().used}% used, critically full`);

  // 25 → 75 → 130 (clamped to 100) → no data → 25 again.
  readonly #periods: ({ percentage: number } | undefined)[] = [
    { percentage: 25 },
    { percentage: 75 },
    { percentage: 130 },
    undefined,
  ];
  readonly #period = signal(0);
  protected readonly arrivals = computed(() => this.#periods[this.#period()]);

  protected toggleMaximum(): void {
    if (this.maximum() === 100) {
      this.maximum.set(140);
      return;
    }
    this.maximum.set(100);
  }

  protected toggleLow(): void {
    if (this.singleLow() === undefined) {
      this.singleLow.set(65);
      return;
    }
    this.singleLow.set(undefined);
  }

  protected nextPeriod(): void {
    this.#period.set((this.#period() + 1) % this.#periods.length);
  }
}

/**
 * The fixture's stand-in for budget.bs's generated row (`budget.generated.server.ts:46-100`):
 * `name` is nullable, `status` is tagged by `_tag`, and users are usernames.
 */
type BudgetStatus =
  | { readonly _tag: "Draft" }
  | { readonly _tag: "Submitted"; readonly submittedOn: string; readonly submittedBy: string }
  | {
      readonly _tag: "Approved";
      readonly submittedOn: string;
      readonly submittedBy: string;
      readonly approvalReference: string;
      readonly approvedOn: string;
      readonly approvedBy: string;
    };

interface BudgetRow {
  readonly id: string;
  readonly name: string | null;
  readonly status: BudgetStatus;
  /** Fixture-only: budget.bs has no amount. It exercises the end-aligned money column. */
  readonly amount: number;
}

type BudgetSortKey = "name" | "status" | "submittedOn" | "amount";

interface BudgetSort {
  readonly key: BudgetSortKey;
  readonly direction: TableSort;
}

const BUDGET_PAGE_SIZE = 4;

/** Fixture-only projection: the generated row carries usernames, not display names. */
const USER_NAMES = new Map([
  ["ada", "Ada Lovelace"],
  ["grace", "Grace Hopper"],
]);

function displayName(username: string): string {
  const name = USER_NAMES.get(username);

  if (name === undefined) {
    throw new Error(`No fixture user ${username}`);
  }

  return name;
}

/** Ten rows over three statuses, one of them unnamed: three pages of four, the last one partial. */
const BUDGETS: readonly BudgetRow[] = [
  { id: "b01", name: "Capital expenditure", status: { _tag: "Draft" }, amount: 48250 },
  {
    id: "b02",
    name: "Facilities",
    status: { _tag: "Submitted", submittedOn: "2026-03-12", submittedBy: "ada" },
    amount: 9800,
  },
  {
    id: "b03",
    name: "Marketing",
    status: {
      _tag: "Approved",
      submittedOn: "2026-02-02",
      submittedBy: "ada",
      approvalReference: "BUD-2026-0042",
      approvedOn: "2026-02-10",
      approvedBy: "grace",
    },
    amount: 126400,
  },
  {
    id: "b04",
    name: "Research",
    status: { _tag: "Submitted", submittedOn: "2026-03-20", submittedBy: "grace" },
    amount: 72000,
  },
  { id: "b05", name: "Training", status: { _tag: "Draft" }, amount: 15600 },
  {
    id: "b06",
    name: "Travel",
    status: {
      _tag: "Approved",
      submittedOn: "2026-01-15",
      submittedBy: "grace",
      approvalReference: "BUD-2026-0017",
      approvedOn: "2026-01-22",
      approvedBy: "ada",
    },
    amount: 31200,
  },
  { id: "b07", name: null, status: { _tag: "Draft" }, amount: 5000 },
  {
    id: "b08",
    name: "Hiring",
    status: { _tag: "Submitted", submittedOn: "2026-02-27", submittedBy: "ada" },
    amount: 88900,
  },
  {
    id: "b09",
    name: "Legal",
    status: {
      _tag: "Approved",
      submittedOn: "2026-01-08",
      submittedBy: "ada",
      approvalReference: "BUD-2026-0009",
      approvedOn: "2026-01-12",
      approvedBy: "grace",
    },
    amount: 22750,
  },
  { id: "b10", name: "Software licences", status: { _tag: "Draft" }, amount: 40100 },
];

function submittedOn(status: BudgetStatus): string | null {
  if (status._tag === "Draft") {
    return null;
  }

  return status.submittedOn;
}

function sortValue(row: BudgetRow, key: BudgetSortKey): string | number | null {
  if (key === "name") {
    return row.name;
  }

  if (key === "status") {
    return row.status._tag;
  }

  if (key === "submittedOn") {
    return submittedOn(row.status);
  }

  return row.amount;
}

/** The fixture view's order: missing values last in both directions, ties by id. */
function compareBudgets(a: BudgetRow, b: BudgetRow, sort: BudgetSort): number {
  const left = sortValue(a, sort.key);
  const right = sortValue(b, sort.key);

  if (left === null || right === null) {
    if (left === right) {
      return a.id.localeCompare(b.id);
    }

    if (left === null) {
      return 1;
    }

    return -1;
  }

  let order: number;

  if (typeof left === "number" && typeof right === "number") {
    order = left - right;
  } else {
    order = String(left).localeCompare(String(right), "en");
  }

  if (order === 0) {
    return a.id.localeCompare(b.id);
  }

  if (sort.direction === "descending") {
    return -order;
  }

  return order;
}

@Component({
  selector: "app-budget-list",
  imports: [Badge, Button, CurrencyPipe, DatePipe, EmptyParts, PageParts, TableParts],
  template: `
    <section zzPage>
      <header zzPageHeader>
        <div>
          <h2 zzPageTitle [id]="titleId()">{{ heading() }}</h2>
          <p zzPageDescription>
            Acme Ltd · fiscal year 2026. Submit a draft, or approve a submitted one.
          </p>
        </div>
        <div zzPageActions>
          <button zzButton>Export</button>
          <button zzButton variant="primary">New budget</button>
        </div>
      </header>

      <div zzTableFrame [aria-labelledby]="titleId()">
        <table zzTable [attr.aria-labelledby]="titleId()">
          <thead>
            <tr zzTableRow>
              <th zzTableColumnHeader [sort]="sortOf('name')">
                <button zzTableSortButton (click)="toggleSort('name')">Name</button>
              </th>
              <th zzTableColumnHeader [sort]="sortOf('status')">
                <button zzTableSortButton (click)="toggleSort('status')">Status</button>
              </th>
              <th zzTableColumnHeader [sort]="sortOf('submittedOn')">
                <button zzTableSortButton (click)="toggleSort('submittedOn')">Submitted</button>
              </th>
              <th zzTableColumnHeader align="end" [sort]="sortOf('amount')">
                <button zzTableSortButton (click)="toggleSort('amount')">Amount</button>
              </th>
              <th zzTableColumnHeader align="end"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            @for (budget of visible(); track budget.id) {
              <tr zzTableRow>
                <td zzTableCell>{{ budget.name ?? "Untitled draft" }}</td>
                <td zzTableCell>
                  @switch (budget.status._tag) {
                    @case ("Draft") {
                      <span zzBadge tone="neutral">Draft</span>
                    }
                    @case ("Submitted") {
                      @let by = budget.status.submittedBy;
                      <span zzBadge tone="info">Submitted by {{ displayName(by) }}</span>
                    }
                    @case ("Approved") {
                      @let reference = budget.status.approvalReference;
                      <span zzBadge tone="success">Approved · {{ reference }}</span>
                    }
                    @default never(budget.status);
                  }
                </td>
                <td zzTableCell>{{ (submittedOn(budget.status) | date: "d MMM y") ?? "—" }}</td>
                <td zzTableCell align="end">{{ budget.amount | currency: "EUR" }}</td>
                <td zzTableCell align="end" class="whitespace-nowrap">
                  @if (budget.status._tag === "Draft") {
                    <button zzButton size="sm">Submit</button>
                  }
                  @if (budget.status._tag === "Submitted") {
                    <button zzButton size="sm">Back to draft</button>
                    <button zzButton size="sm" variant="primary">Approve</button>
                  }
                </td>
              </tr>
            } @empty {
              <tr zzTableRow>
                <td zzTableCell colspan="5"><div zzEmpty>No budgets match</div></td>
              </tr>
            }
          </tbody>
        </table>
        <nav zzTablePager [attr.aria-label]="heading() + ' pages'">
          <output>{{ rangeText() }}</output>
          <button
            zzButton
            size="sm"
            [disabled]="!hasPrevious()"
            focusableWhenDisabled
            (click)="previous()"
          >
            Previous
          </button>
          <button zzButton size="sm" [disabled]="!hasNext()" focusableWhenDisabled (click)="next()">
            Next
          </button>
        </nav>
      </div>
    </section>
  `,
})
export class BudgetList {
  readonly rows = input.required<readonly BudgetRow[]>();
  // Not `title`: a static `title` attribute would also stay on the host as a native tooltip.
  readonly heading = input.required<string>();
  readonly titleId = input.required<string>();

  protected readonly submittedOn = submittedOn;
  protected readonly displayName = displayName;
  protected readonly sort = signal<BudgetSort>({ key: "name", direction: "ascending" });
  protected readonly page = signal(1);

  protected readonly sorted = computed(() => {
    const sort = this.sort();
    const rows = [...this.rows()];

    rows.sort((a, b) => compareBudgets(a, b, sort));

    return rows;
  });

  protected readonly pageCount = computed(() =>
    Math.max(1, Math.ceil(this.rows().length / BUDGET_PAGE_SIZE)),
  );
  protected readonly hasPrevious = computed(() => this.page() > 1);
  protected readonly hasNext = computed(() => this.page() < this.pageCount());

  protected readonly visible = computed(() => {
    const start = (this.page() - 1) * BUDGET_PAGE_SIZE;

    return this.sorted().slice(start, start + BUDGET_PAGE_SIZE);
  });

  protected readonly rangeText = computed(() => {
    const total = this.rows().length;

    if (total === 0) {
      return "No budgets";
    }

    const first = (this.page() - 1) * BUDGET_PAGE_SIZE + 1;
    const last = Math.min(first + BUDGET_PAGE_SIZE - 1, total);

    return `${first}–${last} of ${total}`;
  });

  protected sortOf(key: BudgetSortKey): TableSort | null {
    const current = this.sort();

    if (current.key !== key) {
      return null;
    }

    return current.direction;
  }

  /** The view's paging rule: a new sort returns to page 1. */
  protected toggleSort(key: BudgetSortKey): void {
    const current = this.sort();

    this.page.set(1);

    if (current.key === key && current.direction === "ascending") {
      this.sort.set({ key, direction: "descending" });

      return;
    }

    this.sort.set({ key, direction: "ascending" });
  }

  // A focusable disabled button still fires (click), so each handler checks its boundary.
  protected previous(): void {
    if (!this.hasPrevious()) {
      return;
    }

    this.page.update((page) => page - 1);
  }

  protected next(): void {
    if (!this.hasNext()) {
      return;
    }

    this.page.update((page) => page + 1);
  }
}

interface CostCentre {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly region: string;
  readonly department: string;
  readonly holder: string;
  readonly fiscalYear: string;
  readonly approved: number;
  readonly spent: number;
}

/** View 1a without buttons: eight text columns, wider than a phone and narrower than a desktop. */
const COST_CENTRES: readonly CostCentre[] = [
  {
    id: "c1",
    name: "Head office",
    owner: "Ada Lovelace",
    region: "Attica",
    department: "Finance",
    holder: "Grace Hopper",
    fiscalYear: "2026",
    approved: 480000,
    spent: 212400,
  },
  {
    id: "c2",
    name: "Thessaloniki branch",
    owner: "Grace Hopper",
    region: "Central Macedonia",
    department: "Sales",
    holder: "Ada Lovelace",
    fiscalYear: "2026",
    approved: 156000,
    spent: 98750,
  },
  {
    id: "c3",
    name: "Patras warehouse",
    owner: "Ada Lovelace",
    region: "Western Greece",
    department: "Logistics",
    holder: "Grace Hopper",
    fiscalYear: "2026",
    approved: 92500,
    spent: 40100,
  },
];

@Component({
  selector: "app-cost-centres",
  imports: [Button, CurrencyPipe, EmptyParts, TableParts],
  template: `
    <h3 class="sr-only" [id]="titleId()">{{ heading() }}</h3>
    <button zzButton size="sm" [id]="titleId() + '-filter'">Filter</button>
    <div zzTableFrame [aria-labelledby]="titleId()" class="mt-2">
      <table zzTable [attr.aria-labelledby]="titleId()">
        <thead>
          <tr zzTableRow>
            <th zzTableColumnHeader>Cost centre</th>
            <th zzTableColumnHeader>Owner</th>
            <th zzTableColumnHeader>Region</th>
            <th zzTableColumnHeader>Department</th>
            <th zzTableColumnHeader>Budget holder</th>
            <th zzTableColumnHeader>Fiscal year</th>
            <th zzTableColumnHeader align="end">Approved total</th>
            <th zzTableColumnHeader align="end">Spent to date</th>
          </tr>
        </thead>
        <tbody>
          @for (centre of rows(); track centre.id) {
            <tr zzTableRow>
              <td zzTableCell>{{ centre.name }}</td>
              <td zzTableCell>{{ centre.owner }}</td>
              <td zzTableCell>{{ centre.region }}</td>
              <td zzTableCell>{{ centre.department }}</td>
              <td zzTableCell>{{ centre.holder }}</td>
              <td zzTableCell>{{ centre.fiscalYear }}</td>
              <td zzTableCell align="end">{{ centre.approved | currency: "EUR" }}</td>
              <td zzTableCell align="end">{{ centre.spent | currency: "EUR" }}</td>
            </tr>
          } @empty {
            <tr zzTableRow>
              <!-- A long unbroken search term wraps inside the visible width. -->
              <td zzTableCell colspan="8">
                <div zzEmpty>
                  No cost centres match “WGR2026PATRASWAREHOUSELOGISTICSOUTBOUNDFREIGHT0017”
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CostCentres {
  readonly rows = input.required<readonly CostCentre[]>();
  readonly heading = input.required<string>();
  readonly titleId = input.required<string>();
}

@Component({
  selector: "app-list-parts",
  imports: [Badge, Button, EmptyParts, PageParts, TableParts],
  template: `
    <div class="flex flex-wrap gap-2" id="badges-background">
      <span zzBadge>Draft</span>
      <span zzBadge tone="info">Submitted by Ada Lovelace</span>
      <span zzBadge tone="success">Approved · BUD-2026-0042</span>
      <span zzBadge tone="warning">Over limit</span>
      <span zzBadge tone="danger">Rejected</span>
    </div>

    <div
      class="flex flex-wrap gap-2 rounded-surface border border-border bg-surface p-3"
      id="badges-surface"
    >
      <span zzBadge>Draft</span>
      <span zzBadge tone="info">Submitted by Ada Lovelace</span>
      <span zzBadge tone="success">Approved · BUD-2026-0042</span>
      <span zzBadge tone="warning">Over limit</span>
      <span zzBadge tone="danger">Rejected</span>
    </div>

    <div class="flex gap-2 [--info:initial]" id="badges-no-info">
      <span zzBadge>Draft</span>
      <span zzBadge tone="info">Submitted by Ada Lovelace</span>
    </div>

    <div class="light grid gap-4 bg-background p-5 text-foreground" id="badges-light">
      <div class="flex flex-wrap gap-2" id="badges-light-background">
        <span zzBadge>Draft</span>
        <span zzBadge tone="info">Submitted by Ada Lovelace</span>
        <span zzBadge tone="success">Approved · BUD-2026-0042</span>
        <span zzBadge tone="warning">Over limit</span>
        <span zzBadge tone="danger">Rejected</span>
      </div>
      <div zzTableFrame aria-label="Light budgets">
        <!-- An inherited text-end, which align="start" cells and headers override. -->
        <table zzTable aria-label="Light budgets" class="text-end">
          <thead>
            <tr zzTableRow>
              <th zzTableColumnHeader sort="ascending"><button zzTableSortButton>Name</button></th>
              <th zzTableColumnHeader><button zzTableSortButton>Status</button></th>
            </tr>
          </thead>
          <tbody>
            <tr zzTableRow>
              <td zzTableCell>Facilities</td>
              <td zzTableCell>
                <span class="flex flex-wrap gap-2" id="badges-light-surface">
                  <span zzBadge>Draft</span>
                  <span zzBadge tone="info">Submitted by Ada Lovelace</span>
                  <span zzBadge tone="success">Approved · BUD-2026-0042</span>
                  <span zzBadge tone="warning">Over limit</span>
                  <span zzBadge tone="danger">Rejected</span>
                </span>
              </td>
            </tr>
            <!-- A table nested in a cell: TableFrame's Empty and last-row rules stay on its own table. -->
            <tr zzTableRow>
              <td zzTableCell>Allocations</td>
              <td zzTableCell>
                <table zzTable aria-label="Facilities allocations" id="nested-table">
                  <tbody>
                    <tr zzTableRow>
                      <td zzTableCell colspan="2">
                        <div zzEmpty class="py-0" id="empty-nested">No allocations</div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
            <!-- An Empty in a row with other cells: TableFrame's full-span rule leaves it alone. -->
            <tr zzTableRow>
              <td zzTableCell>Training</td>
              <td zzTableCell>
                <div zzEmpty class="items-start py-0" id="empty-beside-cells">No status yet</div>
              </td>
            </tr>
            <!-- A row's only cell beside a rowspan, without a colspan: the full-span rule leaves
            its Empty alone. -->
            <tr zzTableRow>
              <td zzTableCell rowspan="2">Travel</td>
              <td zzTableCell>Draft</td>
            </tr>
            <tr zzTableRow>
              <td zzTableCell>
                <div zzEmpty class="items-start py-0" id="empty-beside-rowspan">
                  No approver yet
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- The caller's alignment utility wins over align="end" on a header and a cell. -->
    <table zzTable aria-label="Alignment overrides" id="table-align-override">
      <thead>
        <tr zzTableRow>
          <th zzTableColumnHeader align="end" class="text-center">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr zzTableRow>
          <td zzTableCell align="end" class="text-center">€1,200.00</td>
        </tr>
      </tbody>
    </table>

    <section zzPage class="p-0" id="page-long">
      <header zzPageHeader>
        <div>
          <h3 zzPageTitle>Organisation budgets for fiscal year 2026</h3>
          <p zzPageDescription>
            Acme Ltd · drafts, submissions and approvals across every department.
          </p>
        </div>
        <div zzPageActions lang="de">
          <button
            zzButton
            variant="primary"
            class="h-auto min-h-8 max-w-full py-1 text-start whitespace-normal [overflow-wrap:anywhere]"
          >
            Alle verbleibenden Budgetentwürfe zur Genehmigung einreichen
          </button>
        </div>
      </header>
    </section>

    <div zzEmpty id="empty-rich">
      <h3 zzEmptyTitle>No budgets yet</h3>
      <p zzEmptyDescription>Create the first budget for fiscal year 2026; it starts as a draft.</p>
      <div zzEmptyActions><button zzButton variant="primary">New budget</button></div>
    </div>
  `,
})
export class ListParts {}

@Component({
  selector: "app-root",
  imports: [
    BudgetList,
    CostCentres,
    ListParts,
    Button,
    ButtonLink,
    AlertDialogParts,
    AvatarParts,
    Calendars,
    DateEntries,
    MoreDatePickers,
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
    Meters,
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
    ToastRegion,
    Toggles,
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
            <div zzDialogBody>
              <div class="grid gap-4">
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
            <div zzSheetBody>
              <div class="grid gap-4">
                <div zzField>
                  <label zzFieldLabel>Status</label>
                  <input zzInput [readOnly]="filtersPending()" />
                </div>
                <div zzField>
                  <label zzFieldLabel>Search</label>
                  <input zzInput autofocus [readOnly]="filtersPending()" id="sheet-search" />
                </div>
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

      <!-- A BizneScript list view: Page, Table, Badge and Empty. -->
      <div class="grid basis-full gap-8" id="list-views">
        <app-budget-list
          id="budget-list"
          heading="Budgets"
          titleId="budget-list-title"
          [rows]="budgets"
        />
        <app-budget-list
          id="budget-list-empty"
          heading="Archived budgets"
          titleId="budget-list-empty-title"
          [rows]="[]"
        />
        <app-cost-centres
          id="wide-report"
          heading="Cost centres"
          titleId="wide-report-title"
          [rows]="costCentres"
        />
        <app-cost-centres
          id="wide-report-empty"
          heading="Closed cost centres"
          titleId="wide-report-empty-title"
          [rows]="[]"
        />
        <!-- min-w-0, so a no-wrap Button can't widen the grid item past a phone-width header. -->
        <app-list-parts class="min-w-0" />
      </div>
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

        <div zzPopover id="capped-notes-popover">
          <button zzPopoverTrigger variant="ghost" id="capped-notes-trigger">Capped notes</button>
          <div
            zzPopoverContent
            aria-label="Capped notes"
            tabindex="0"
            id="capped-notes-content"
            class="max-h-48"
          >
            @for (note of releaseNotes; track $index) {
              <p class="mb-2">{{ note }}</p>
            }
          </div>
        </div>

        <div zzPopover id="uncapped-notes-popover">
          <button zzPopoverTrigger variant="ghost" id="uncapped-notes-trigger">
            Uncapped notes
          </button>
          <div
            zzPopoverContent
            aria-label="Uncapped notes"
            tabindex="0"
            id="uncapped-notes-content"
            class="max-h-none"
          >
            @for (note of releaseNotes; track $index) {
              <p class="mb-2">{{ note }}</p>
            }
          </div>
        </div>

        <div zzPopover id="wide-popover">
          <button zzPopoverTrigger variant="ghost" id="wide-trigger">Usage</button>
          <div zzPopoverContent aria-label="Usage" id="wide-content">
            <p id="wide-text">
              Each row is one month of usage, metered per seat and per gigabyte of storage, billed
              at the end of the period.
            </p>
            <div zzScrollArea orientation="horizontal" aria-label="Usage table" id="wide-area">
              <table id="wide-table" class="w-160 text-start">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Seats</th>
                    <th>Storage</th>
                    <th>Transfer</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>October</td>
                    <td>12</td>
                    <td>340 GB</td>
                    <td>1.2 TB</td>
                    <td>€1,240</td>
                  </tr>
                </tbody>
              </table>
            </div>
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
            <div zzDialogBody class="my-0" id="steps-body">
              <div class="grid gap-4 py-4">
                <p>Confirm the amount and the account before you continue.</p>
                @for (line of stepFields; track line) {
                  <div zzField>
                    <label zzFieldLabel>{{ line }}</label>
                    <input zzInput />
                  </div>
                }
              </div>
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
    <app-meters />
    <!-- Toast fixtures: every toast but the timed one stays until it's closed. -->
    <section id="toasts" class="flex max-w-3xl flex-wrap items-start gap-2 p-5">
      <button zzButton (click)="toastSuccesses()" id="toast-successes">Three saves</button>
      <button zzButton (click)="toastTall()" id="toast-tall">Tall save</button>
      <button zzButton (click)="toastError()" id="toast-error">Error</button>
      <button zzButton (click)="toastReload()" id="toast-reload">Reload action</button>
      <button zzButton (click)="toastActions()" id="toast-actions">Three actions</button>
      <button zzButton (click)="toastTimed()" id="toast-timed">Timed save</button>
      <button zzButton (click)="toastPair()" id="toast-pair">Two in one handler</button>
      <button zzButton (click)="toastLongAction()" id="toast-long-action">Long action</button>
      <output id="toast-status">{{ toastStatus() }}</output>
      <a href="#before-region" id="before-region">Before</a>
    </section>
    <div zzToastRegion></div>
    <a href="#after-region" id="after-region">After</a>

    <app-calendars />

    <!-- Scrolling fixtures for consumer-scrolling.mjs: an overflowing Menu with a submenu, long
         Dialog and Sheet bodies without autofocus, and an uncapped Combobox over every country,
         chosen Sweden. Each sits between buttons of its own, off the page's other Tab routes. -->
    <section id="scrolling" class="flex flex-wrap items-start gap-4 p-5">
      <button zzButton id="before-menu-long">Before the long menu</button>
      <div zzMenu id="menu-long">
        <button zzMenuTrigger id="menu-long-trigger">Long menu</button>
        <div zzMenuContent id="menu-long-content">
          @for (row of longMenuRows; track row) {
            @if (row === 20) {
              <div zzMenuSub>
                <button zzMenuSubTrigger id="menu-long-sub">More actions</button>
                <div zzMenuContent id="menu-long-sub-content">
                  @for (sub of longSubmenuRows; track sub) {
                    <button zzMenuItem [id]="'menu-long-sub-' + sub">
                      More action {{ sub + 1 }}
                    </button>
                  }
                </div>
              </div>
            }
            <button zzMenuItem [id]="'menu-long-' + row">Action {{ row + 1 }}</button>
          }
        </div>
      </div>
      <button zzButton id="after-menu-long">After the long menu</button>

      <div zzDialog>
        <button zzDialogTrigger id="long-dialog-trigger">Long dialog</button>
        <dialog zzDialogContent id="long-dialog">
          <div zzDialogHeader><h2 zzDialogTitle>Long dialog</h2></div>
          <div zzDialogBody>
            <div class="grid gap-4">
              @for (row of longFormRows; track row) {
                <div zzField>
                  <label zzFieldLabel>Field {{ row + 1 }}</label>
                  <input zzInput [id]="'long-dialog-' + row" />
                </div>
              }
            </div>
          </div>
          <div zzDialogFooter><button zzDialogClose>Close</button></div>
        </dialog>
      </div>

      <div zzSheet>
        <button zzSheetTrigger id="long-sheet-trigger">Long sheet</button>
        <dialog zzSheetContent id="long-sheet">
          <div zzSheetHeader><h2 zzSheetTitle>Long sheet</h2></div>
          <div zzSheetBody>
            <div class="grid gap-4">
              @for (row of longFormRows; track row) {
                <div zzField>
                  <label zzFieldLabel>Field {{ row + 1 }}</label>
                  <input zzInput [id]="'long-sheet-' + row" />
                </div>
              }
            </div>
          </div>
          <div zzSheetFooter><button zzSheetClose>Close</button></div>
        </dialog>
      </div>

      <div zzCombobox [(value)]="countrySearch" class="w-80" id="country-search">
        <input zzComboboxInput aria-label="Country search" id="country-search-input" />
        <div zzComboboxContent id="country-search-content">
          @for (option of countries; track option.code) {
            <div
              zzComboboxOption
              [value]="option.code"
              [label]="option.name"
              [id]="'country-search-' + option.code.toLowerCase()"
            >
              {{ option.name }}
            </div>
          }
        </div>
      </div>
      <button zzButton id="after-country-search">After the country search</button>
    </section>
    <app-date-entries />
    <app-toggles />
    <app-more-date-pickers />
  `,
})
export class App {
  protected readonly budgets = BUDGETS;
  protected readonly costCentres = COST_CENTRES;
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
  protected readonly toasts = inject(Toasts);
  protected readonly toastStatus = signal("");
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
  protected readonly countrySearch = signal<string | null>("SE");
  protected readonly longMenuRows = Array.from({ length: 40 }, (_, index) => index);
  protected readonly longSubmenuRows = this.longMenuRows.slice(0, 30);
  protected readonly longFormRows = this.longMenuRows.slice(0, 20);
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

  protected toastSuccesses(): void {
    for (const title of ["Checklist saved", "Task updated", "Release notes saved"]) {
      this.toasts.add({ title, kind: "success" }, { duration: Infinity });
    }
  }

  protected toastTall(): void {
    this.toasts.add(
      {
        title: "Release is ready for review",
        description:
          "The checklist, release notes and onboarding changes have been saved. Share them with your team before publishing.",
        kind: "success",
      },
      { duration: Infinity },
    );
  }

  protected toastError(): void {
    this.toasts.add(
      {
        title: "Couldn't save your changes",
        description: "Your connection was interrupted. Try saving again when you're back online.",
        kind: "error",
      },
      { duration: Infinity },
    );
  }

  protected toastReload(): void {
    this.toasts.add(
      {
        title: "A new version is available",
        description: "Reload to get the latest changes.",
        kind: "info",
        action: { label: "Reload", run: () => this.toastStatus.set("Reloaded") },
      },
      { duration: Infinity },
    );
  }

  protected toastActions(): void {
    for (const name of ["Oldest", "Middle", "Newest"]) {
      this.toasts.add(
        {
          title: `${name} card`,
          kind: "info",
          action: {
            label: `${name} action`,
            run: () => this.toastStatus.set(`${name} action ran`),
          },
        },
        { duration: Infinity },
      );
    }
  }

  protected toastTimed(): void {
    this.toasts.add({ title: "Saved with the default duration", kind: "success" });
  }

  protected toastLongAction(): void {
    this.toasts.add(
      {
        title: "An update is ready",
        kind: "info",
        action: {
          label: "Download the updated version of the application",
          run: () => this.toastStatus.set("Download started"),
        },
      },
      { duration: Infinity },
    );
  }

  protected toastPair(): void {
    this.toasts.add({ title: "First in handler", kind: "success" }, { duration: Infinity });
    this.toasts.add({ title: "Second in handler", kind: "warning" }, { duration: Infinity });
  }
}
