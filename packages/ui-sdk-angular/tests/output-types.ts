// Type-level checks that each change-request and highlight output keeps core's callback types:
// `value` and `details` must be exactly what core passes, never `any`. `typecheck` compiles this
// file; it has no runtime part.
import type { OutputEmitterRef } from "@angular/core";
import type { ɵExpect } from "@loozo/ui-sdk-angular";
import type { UiAccordion, UiAccordionItem } from "@loozo/ui-sdk-angular/accordion";
import type { UiCheckbox } from "@loozo/ui-sdk-angular/checkbox";
import type { UiCollapsible } from "@loozo/ui-sdk-angular/collapsible";
import type { UiRadioGroup } from "@loozo/ui-sdk-angular/radio";
import type { UiSelect } from "@loozo/ui-sdk-angular/select";
import type { UiSwitch } from "@loozo/ui-sdk-angular/switch";
import type { UiTabs } from "@loozo/ui-sdk-angular/tabs";
import type { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import type { ChangeDetails } from "@ui-sdk/core";
import type { AccordionValueChangeReason } from "@ui-sdk/core/accordion";
import type { CheckboxCheckedChangeReason, CheckedState } from "@ui-sdk/core/checkbox";
import type { CollapsibleOpenChangeReason } from "@ui-sdk/core/collapsible";
import type { RadioGroupValueChangeReason } from "@ui-sdk/core/radio";
import type { SwitchCheckedChangeReason } from "@ui-sdk/core/switch";
import type { TabsValueChangeReason } from "@ui-sdk/core/tabs";
import type {
  ListHighlightDetails,
  SelectOpenChangeReason,
  SelectQueryChangeReason,
  SelectValueChangeReason,
} from "@ui-sdk/core/select";
import type { TogglePressedChangeReason } from "@ui-sdk/core/toggle";

type Emitted<O> = O extends OutputEmitterRef<infer E> ? E : never;

/** Exact equality: `any` equals only `any`, so an erased field fails. */
type Same<A, B> =
  (<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2 ? true : false;

type Fruit = { readonly id: string; readonly label: string };

type StringSelect = UiSelect<string>;
type FruitSelect = UiSelect<Fruit>;

type _StringValueRequest = [
  ɵExpect<Same<Emitted<StringSelect["valueChangeRequest"]>["value"], string | null>>,
  ɵExpect<
    Same<
      Emitted<StringSelect["valueChangeRequest"]>["details"],
      ChangeDetails<SelectValueChangeReason>
    >
  >,
];

type _FruitValueRequest = [
  ɵExpect<Same<Emitted<FruitSelect["valueChangeRequest"]>["value"], Fruit | null>>,
  ɵExpect<
    Same<
      Emitted<FruitSelect["valueChangeRequest"]>["details"],
      ChangeDetails<SelectValueChangeReason>
    >
  >,
];

type _Highlight = [
  ɵExpect<Same<Emitted<StringSelect["highlight"]>["value"], string | null>>,
  ɵExpect<Same<Emitted<FruitSelect["highlight"]>["value"], Fruit | null>>,
  ɵExpect<Same<Emitted<FruitSelect["highlight"]>["details"], ListHighlightDetails>>,
];

type _OpenAndQueryRequests = [
  ɵExpect<Same<Emitted<FruitSelect["openChangeRequest"]>["value"], boolean>>,
  ɵExpect<
    Same<
      Emitted<FruitSelect["openChangeRequest"]>["details"],
      ChangeDetails<SelectOpenChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<FruitSelect["queryChangeRequest"]>["value"], string>>,
  ɵExpect<
    Same<
      Emitted<FruitSelect["queryChangeRequest"]>["details"],
      ChangeDetails<SelectQueryChangeReason>
    >
  >,
];

type _PressedRequest = [
  ɵExpect<Same<Emitted<UiToggle["pressedChangeRequest"]>["value"], boolean>>,
  ɵExpect<
    Same<
      Emitted<UiToggle["pressedChangeRequest"]>["details"],
      ChangeDetails<TogglePressedChangeReason>
    >
  >,
];

type _CheckedRequests = [
  ɵExpect<Same<Emitted<UiCheckbox["checkedChangeRequest"]>["value"], CheckedState>>,
  ɵExpect<
    Same<
      Emitted<UiCheckbox["checkedChangeRequest"]>["details"],
      ChangeDetails<CheckboxCheckedChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiCheckbox["checkedChange"]>, CheckedState>>,
  ɵExpect<Same<Emitted<UiSwitch["checkedChangeRequest"]>["value"], boolean>>,
  ɵExpect<
    Same<
      Emitted<UiSwitch["checkedChangeRequest"]>["details"],
      ChangeDetails<SwitchCheckedChangeReason>
    >
  >,
];

type Size = "s" | "m" | "l";

type _RadioValueRequest = [
  ɵExpect<Same<Emitted<UiRadioGroup<Size>["valueChangeRequest"]>["value"], Size | null>>,
  ɵExpect<
    Same<
      Emitted<UiRadioGroup<Size>["valueChangeRequest"]>["details"],
      ChangeDetails<RadioGroupValueChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiRadioGroup<Size>["valueChange"]>, Size | null>>,
];

type _Touch = [
  ɵExpect<Same<Emitted<UiCheckbox["touch"]>, void>>,
  ɵExpect<Same<Emitted<UiSwitch["touch"]>, void>>,
  ɵExpect<Same<Emitted<UiRadioGroup["touch"]>, void>>,
  ɵExpect<Same<Emitted<FruitSelect["touch"]>, void>>,
];

type Section = "profile" | "billing";

type _TabsValueRequest = [
  ɵExpect<Same<Emitted<UiTabs<Section>["valueChangeRequest"]>["value"], Section | null>>,
  ɵExpect<
    Same<
      Emitted<UiTabs<Section>["valueChangeRequest"]>["details"],
      ChangeDetails<TabsValueChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiTabs<Section>["valueChange"]>, Section | null>>,
];

type _AccordionValueRequest = [
  ɵExpect<Same<Emitted<UiAccordion<Section>["valueChangeRequest"]>["value"], Section[]>>,
  ɵExpect<
    Same<
      Emitted<UiAccordion<Section>["valueChangeRequest"]>["details"],
      ChangeDetails<AccordionValueChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiAccordion<Section>["valueChange"]>, Section[]>>,
];

/** An item reports a request and its panel settling, never a change of its own (A2). */
type _AccordionItemOutputs = [
  ɵExpect<Same<Emitted<UiAccordionItem["openChangeRequest"]>["value"], boolean>>,
  ɵExpect<
    Same<
      Emitted<UiAccordionItem["openChangeRequest"]>["details"],
      ChangeDetails<AccordionValueChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiAccordionItem["openChangeComplete"]>, boolean>>,
  ɵExpect<Same<"openChange" extends keyof UiAccordionItem ? true : false, false>>,
];

type _CollapsibleOpenRequest = [
  ɵExpect<Same<Emitted<UiCollapsible["openChangeRequest"]>["value"], boolean>>,
  ɵExpect<
    Same<
      Emitted<UiCollapsible["openChangeRequest"]>["details"],
      ChangeDetails<CollapsibleOpenChangeReason>
    >
  >,
  ɵExpect<Same<Emitted<UiCollapsible["openChange"]>, boolean>>,
  ɵExpect<Same<Emitted<UiCollapsible["openChangeComplete"]>, boolean>>,
];
