import { test } from "./contract-test.js";
import {
  switchControl,
  composedCase,
  fieldCase,
  replacementCase,
  signalFormsCase,
  standaloneCase,
} from "./boolean-controls.js";
import {
  fieldWithTooltipCase,
  mixedViewsCase,
  withoutStaticCase,
} from "./co-applied-description.js";

test("W1: a standalone Switch is role=switch with aria-checked; click, Space and Enter flip [(checked)] once; external writes are authoritative, also while disabled; a focusable disabled Switch runs only its own click listener; static ARIA is kept outside a Field", async ({
  page,
}, info) => {
  await standaloneCase(page, info, switchControl);
});

test("W2: inside a Field the Label names the Switch with for, before and after it, giving its accessible name; a label click toggles it; the Description replaces a static aria-describedby", async ({
  page,
}, info) => {
  await fieldCase(page, info, switchControl);
});

test("W3: with [formField] the Switch shows the initial value, writes user changes, follows model writes, emits touch on blur, shows required errors after blur and submit(), resets, takes focus from focusBoundControl(), drops user writes while readonly and is natively disabled by disabled()", async ({
  page,
}, info) => {
  await signalFormsCase(page, info, switchControl);
});

test("W4: a consumer component composing the Switch through hostDirectives with exposed checked, checkedChange, disabled and touch is the control [formField] finds, and the Switch reads FORM_FIELD on its element", async ({
  page,
}, info) => {
  await composedCase(page, info, switchControl);
});

test("W5: factory and existing Switch Options replace the exposed own inputs and drive checked, disabled, focusability and ID without emitting the unused model's output", async ({
  page,
}, info) => {
  await replacementCase(page, info, switchControl);
});

test("W7: a Switch co-applied with a Tooltip Trigger inside a Field has one aria-describedby naming the Field's IDs and the Content's in registration order, from server HTML on, in both directive orders; each side's change keeps the other's IDs", async ({
  page,
}, info) => {
  await fieldWithTooltipCase(page, info, "switch");
});

test("W8: M8 with a Switch instead of <input ogFieldControl>", async ({ page }, info) => {
  await withoutStaticCase(
    page,
    info,
    [{ testId: "bare-field-switch", id: "bare-field-switch-error" }],
    "toggle-bare-error",
  );
});

test("W9: M9 with a Switch instead of <input ogFieldControl>", async ({ page }, info) => {
  await mixedViewsCase(page, info, {
    testId: "mixed-switch",
    tipId: "mixed-switch-tip",
    errorId: "mixed-switch-error",
  });
});
