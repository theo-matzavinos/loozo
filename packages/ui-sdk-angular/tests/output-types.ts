// Type-level checks that each change-request and highlight output keeps core's callback types:
// `value` and `details` must be exactly what core passes, never `any`. `typecheck` compiles this
// file; it has no runtime part.
import type { OutputEmitterRef } from "@angular/core";
import type { ɵExpect } from "@loozo/ui-sdk-angular";
import type { UiSelect } from "@loozo/ui-sdk-angular/select";
import type { UiToggle } from "@loozo/ui-sdk-angular/toggle";
import type { ChangeDetails } from "@ui-sdk/core";
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
