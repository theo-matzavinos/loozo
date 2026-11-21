import { Component } from "@angular/core";
import { Workload as Collection } from "./collection";
import { Workload as Presence } from "./presence";
import { Workload as Collapsible } from "./collapsible";
import { Workload as Accordion } from "./accordion";
import { Workload as Popover } from "./popover";
import { Workload as Toggle } from "./toggle";
import { Workload as Tabs } from "./tabs";
import { Workload as ToggleGroup } from "./toggle-group";
import { Workload as Toolbar } from "./toolbar";
import { Workload as RadioGroup } from "./radio-group";
import { Workload as Button } from "./button";
import { Workload as Tooltip } from "./tooltip";
import { Workload as Field } from "./field";
import { Workload as Checkbox } from "./checkbox";
import { Workload as Switch } from "./switch";
import { Workload as Dialog } from "./dialog";
import { Workload as Select } from "./select";
import { Workload as Calendar } from "./calendar";
import { Workload as DateField } from "./date-field";
import { Workload as DatePicker } from "./date-picker";
import { Workload as Menu } from "./menu";
import { Workload as Combobox } from "./combobox";
import { Workload as Toast } from "./toast";
import { Workload as Slider } from "./slider";
import { Workload as Progress } from "./progress";
import { Workload as NumberField } from "./number-field";
import { Workload as OtpField } from "./otp-field";
import { Workload as FileField } from "./file-field";
import { Workload as Avatar } from "./avatar";
import { Workload as Utils } from "./utils";

// Every entry's workload in one application.
@Component({
  selector: "bench-root",
  imports: [
    Collection,
    Presence,
    Collapsible,
    Accordion,
    Popover,
    Toggle,
    Tabs,
    ToggleGroup,
    Toolbar,
    RadioGroup,
    Button,
    Tooltip,
    Field,
    Checkbox,
    Switch,
    Dialog,
    Select,
    Calendar,
    DateField,
    DatePicker,
    Menu,
    Combobox,
    Toast,
    Slider,
    Progress,
    NumberField,
    OtpField,
    FileField,
    Avatar,
    Utils,
  ],
  template: `
    <bench-collection />
    <bench-presence />
    <bench-collapsible />
    <bench-accordion />
    <bench-popover />
    <bench-toggle />
    <bench-tabs />
    <bench-toggle-group />
    <bench-toolbar />
    <bench-radio-group />
    <bench-button />
    <bench-tooltip />
    <bench-field />
    <bench-checkbox />
    <bench-switch />
    <bench-dialog />
    <bench-select />
    <bench-calendar />
    <bench-date-field />
    <bench-date-picker />
    <bench-menu />
    <bench-combobox />
    <bench-toast />
    <bench-slider />
    <bench-progress />
    <bench-number-field />
    <bench-otp-field />
    <bench-file-field />
    <bench-avatar />
    <bench-utils />
  `,
})
export class Workload {}
