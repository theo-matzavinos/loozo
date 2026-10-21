import { test } from "./contract-test.js";
import {
  checkboxControl,
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

test("J1: a standalone Checkbox is role=checkbox with aria-checked; click and Space flip [(checked)] once, Enter doesn't; external writes are authoritative, also while disabled; a focusable disabled Checkbox runs only its own click listener; static ARIA is kept outside a Field", async ({
  page,
}, info) => {
  await standaloneCase(page, info, checkboxControl);
});

test("J2: inside a Field the Label names the Checkbox with for, before and after it, giving its accessible name; a label click toggles it; the Description replaces a static aria-describedby", async ({
  page,
}, info) => {
  await fieldCase(page, info, checkboxControl);
});

test("J3: with [formField] the Checkbox shows the initial value, writes user changes, follows model writes, emits touch on blur, shows required errors after blur and submit(), resets, takes focus from focusBoundControl(), drops user writes while readonly and is natively disabled by disabled()", async ({
  page,
}, info) => {
  await signalFormsCase(page, info, checkboxControl);
});

test("J4: a consumer component composing the Checkbox through hostDirectives with exposed checked, checkedChange, disabled and touch is the control [formField] finds, and the Checkbox reads FORM_FIELD on its element", async ({
  page,
}, info) => {
  await composedCase(page, info, checkboxControl);
});

test("J5: factory and existing Checkbox Options replace the exposed own inputs and drive checked, disabled, focusability and ID without emitting the unused model's output", async ({
  page,
}, info) => {
  await replacementCase(page, info, checkboxControl);
});

test("J7: a Checkbox co-applied with a Tooltip Trigger inside a Field has one aria-describedby naming the Field's IDs and the Content's in registration order, from server HTML on, in both directive orders; each side's change keeps the other's IDs", async ({
  page,
}, info) => {
  await fieldWithTooltipCase(page, info, "checkbox");
});

test("J8: M8 with a Checkbox instead of <input ogFieldControl>", async ({ page }, info) => {
  await withoutStaticCase(
    page,
    info,
    [{ testId: "bare-field-checkbox", id: "bare-field-checkbox-error" }],
    "toggle-bare-error",
  );
});

test("J9: M9 with a Checkbox instead of <input ogFieldControl>", async ({ page }, info) => {
  await mixedViewsCase(page, info, {
    testId: "mixed-checkbox",
    tipId: "mixed-checkbox-tip",
    errorId: "mixed-checkbox-error",
  });
});
