import type { Locator, Page, TestInfo } from "playwright/test";
import { expect } from "./contract-test.js";
import { fixture } from "./observation.js";

/**
 * A Tooltip Trigger co-applied with a Field control shares one `aria-describedby` with it. The
 * `described-by` fixture renders every control in two directive orders: `tooltip-first` imports
 * the Tooltip first, so its Trigger registers first; `control-first` imports the control first.
 * Tooltip (N) and Field-side (M, J, W, G) cases share these bodies.
 */
export type DescribedControl = "checkbox" | "switch" | "toggle" | "input";

const orders = ["tooltip-first", "control-first"] as const;

type Order = (typeof orders)[number];

const tipText: Record<DescribedControl, string> = {
  checkbox: "Checkbox tip",
  switch: "Switch tip",
  toggle: "Toggle tip",
  input: "Input tip",
};

const descriptionText: Record<DescribedControl, string> = {
  checkbox: "Checkbox description",
  switch: "Switch description",
  toggle: "Toggle description",
  input: "Input description",
};

function control(page: Page, order: Order, testId: string): Locator {
  return page.locator(`[data-order="${order}"]`).getByTestId(testId);
}

/** The Field's IDs and the Tooltip's, in the order the two register. */
function fieldValue(
  order: Order,
  kind: DescribedControl,
  { tip, error }: { readonly tip: boolean; readonly error: boolean },
): string {
  const field = [`${order}-field-${kind}-description`];
  const tooltip: string[] = [];

  if (error) {
    field.push(`${order}-field-${kind}-error`);
  }

  if (tip) {
    tooltip.push(`${order}-field-${kind}-tip`);
  }

  if (order === "tooltip-first") {
    return [...tooltip, ...field].join(" ");
  }

  return [...field, ...tooltip].join(" ");
}

async function toggle(page: Page, order: Order, testId: string): Promise<void> {
  await page.locator(`[data-order="${order}"]`).getByTestId(testId).click();
}

/** Outside a Field: the Tooltip's Content names the control; without it the static value returns. */
export async function tooltipOutsideFieldCase(page: Page, info: TestInfo): Promise<void> {
  const kinds: DescribedControl[] = ["checkbox", "switch", "input"];
  const expectTips = async () => {
    for (const order of orders) {
      for (const kind of kinds) {
        await expect(control(page, order, `outside-${kind}`)).toHaveAttribute(
          "aria-describedby",
          `${order}-outside-${kind}-tip`,
        );
      }
    }
  };

  await fixture(page, "described-by", info, expectTips);
  await expectTips();

  for (const order of orders) {
    for (const kind of kinds) {
      await expect(control(page, order, `outside-${kind}`)).toHaveAccessibleDescription(
        tipText[kind],
      );
    }

    // Without Content nothing names an ID: the consumer's static value is kept.
    await toggle(page, order, "toggle-content");

    for (const kind of kinds) {
      const element = control(page, order, `outside-${kind}`);

      await expect(element).toHaveAttribute("aria-describedby", "static-note");
      await expect(element).toHaveAccessibleDescription("Static note");
      // No Field: no form ARIA joins the Tooltip's.
      await expect(element).not.toHaveAttribute("aria-invalid", /.*/);
    }

    await toggle(page, order, "toggle-content");

    for (const kind of kinds) {
      await expect(control(page, order, `outside-${kind}`)).toHaveAttribute(
        "aria-describedby",
        `${order}-outside-${kind}-tip`,
      );
    }
  }
}

/**
 * Inside a Field: one attribute names the Field's Descriptions and mounted Errors and the
 * Tooltip's Content, in the order the two register, from server HTML on; each side's change
 * leaves the other's IDs.
 */
export async function fieldWithTooltipCase(
  page: Page,
  info: TestInfo,
  kind: DescribedControl,
): Promise<void> {
  const expectInitial = async () => {
    for (const order of orders) {
      await expect(control(page, order, `field-${kind}`)).toHaveAttribute(
        "aria-describedby",
        fieldValue(order, kind, { tip: true, error: false }),
      );
    }
  };

  await fixture(page, "described-by", info, expectInitial);
  await expectInitial();

  for (const order of orders) {
    const element = control(page, order, `field-${kind}`);
    const tipFirst = order === "tooltip-first";
    let description = `${descriptionText[kind]} ${tipText[kind]}`;

    if (tipFirst) {
      description = `${tipText[kind]} ${descriptionText[kind]}`;
    }

    await expect(element).toHaveAccessibleDescription(description);

    // A mounted Error joins the Field's IDs, at their place.
    await toggle(page, order, "toggle-error");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, kind, { tip: true, error: true }),
    );

    // Unmounting Content drops only its ID; the static value stays replaced.
    await toggle(page, order, "toggle-content");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, kind, { tip: false, error: true }),
    );
    await toggle(page, order, "toggle-error");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, kind, { tip: false, error: false }),
    );
    await toggle(page, order, "toggle-content");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, kind, { tip: true, error: false }),
    );
  }
}

/**
 * One owner per element: a Field control and a Tooltip Trigger composed together register with
 * a single shared describer, in template co-application in both orders and through a consumer's
 * `hostDirectives`. Two owners would each write only their own IDs.
 */
export async function sharedOwnerCase(page: Page, info: TestInfo): Promise<void> {
  await fixture(page, "described-by", info);

  for (const order of orders) {
    const element = control(page, order, "field-checkbox");

    // Only the Field side changes: the Tooltip's ID stays.
    await toggle(page, order, "toggle-error");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, "checkbox", { tip: true, error: true }),
    );
    // Only the Tooltip side changes: the Field's IDs stay.
    await toggle(page, order, "toggle-content");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, "checkbox", { tip: false, error: true }),
    );
    await toggle(page, order, "toggle-content");
    await expect(element).toHaveAttribute(
      "aria-describedby",
      fieldValue(order, "checkbox", { tip: true, error: true }),
    );
  }

  // `hostDirectives: [OrigamiTooltipTrigger, OrigamiCheckbox]`: the Trigger registers first.
  const composed = page.getByTestId("composed");

  await expect(composed).toHaveAttribute("aria-describedby", "composed-tip composed-description");
  await expect(composed).toHaveAccessibleDescription("Composed tip Composed description");
  await page.getByTestId("toggle-composed-content").click();
  await expect(composed).toHaveAttribute("aria-describedby", "composed-description");
  await page.getByTestId("toggle-composed-content").click();
  await expect(composed).toHaveAttribute("aria-describedby", "composed-tip composed-description");
}

/** A control described only by Origami, without a static `aria-describedby`, and the ID it names. */
export type Undescribed = { readonly testId: string; readonly id: string };

/**
 * Without a static `aria-describedby`, the IDs hydration adopts from server HTML are not a static
 * value: once the last describer leaves, the attribute is absent, however often it comes back.
 */
export async function withoutStaticCase(
  page: Page,
  info: TestInfo,
  controls: readonly Undescribed[],
  toggleTestId: string,
): Promise<void> {
  const expectNamed = async () => {
    for (const { testId, id } of controls) {
      await expect(page.getByTestId(testId)).toHaveAttribute("aria-describedby", id);
    }
  };
  const expectAbsent = async () => {
    for (const { testId } of controls) {
      await expect(page.getByTestId(testId)).not.toHaveAttribute("aria-describedby", /.*/);
    }
  };

  await fixture(page, "described-by", info, expectNamed);
  await expectNamed();

  await page.getByTestId(toggleTestId).click();
  await expectAbsent();
  await page.getByTestId(toggleTestId).click();
  await expectNamed();
  await page.getByTestId(toggleTestId).click();
  await expectAbsent();
}

/** A Field control co-applied with a Tooltip Trigger whose Content is in a child component. */
export type MixedControl = {
  readonly testId: string;
  readonly tipId: string;
  readonly errorId: string;
};

/**
 * Without a static `aria-describedby`, a Field Error in the control's own view registers before
 * the control's `aria-describedby` is first evaluated and Tooltip Content in a child component
 * after it, so hydration first names only part of the server's IDs. Once the last describer
 * leaves, the attribute is still absent, however often one comes back.
 */
export async function mixedViewsCase(
  page: Page,
  info: TestInfo,
  { testId, tipId, errorId }: MixedControl,
): Promise<void> {
  const element = page.getByTestId(testId);
  // The Trigger is imported before the Field controls, so it registers first.
  const expectBoth = async () => {
    await expect(element).toHaveAttribute("aria-describedby", `${tipId} ${errorId}`);
  };
  const expectAbsent = async () => {
    await expect(element).not.toHaveAttribute("aria-describedby", /.*/);
  };

  await fixture(page, "described-by", info, expectBoth);
  await expectBoth();

  await page.getByTestId("toggle-mixed-content").click();
  await expect(element).toHaveAttribute("aria-describedby", errorId);
  await page.getByTestId("toggle-mixed-error").click();
  await expectAbsent();
  await page.getByTestId("toggle-mixed-content").click();
  await expect(element).toHaveAttribute("aria-describedby", tipId);
  await page.getByTestId("toggle-mixed-content").click();
  await expectAbsent();
}
