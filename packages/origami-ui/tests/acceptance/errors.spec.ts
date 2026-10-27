import { test, expect, type ErrorRecord } from "./contract-test.js";
import { bootstrapHeld, fixture, stopRetentionObservation } from "./observation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNativeMissingProviderError(value: unknown, origin: string): boolean {
  if (
    !isRecord(value) ||
    value.type !== "[object Error]" ||
    value.name !== "Error" ||
    value.message !== "NG0201"
  ) {
    return false;
  }

  if (
    typeof value.stack !== "string" ||
    !value.stack.includes(origin) ||
    !Array.isArray(value.properties)
  ) {
    return false;
  }

  for (const property of value.properties) {
    if (
      isRecord(property) &&
      property.name === "code" &&
      property.value === "-201" &&
      property.accessor === false
    ) {
      return true;
    }
  }

  return false;
}

for (const [variant, caseId, context] of [
  ["orphan-collection", "C2", /collection/i],
  ["orphan-accordion", "A3", /NG0201:[\s\S]*CollectionContext/],
  ["accordion-with-collection", "A3", /NG0201:[\s\S]*AccordionContext/],
  ["orphan-collapsible-trigger", "L2", /NG0201/],
  ["orphan-collapsible-panel", "L2", /NG0201/],
  ["orphan-accordion-panel", "A3 L2", /NG0201/],
  ["orphan-toolbar-toggle-group-single", "K9", /NG0201:[\s\S]*ToolbarContext/],
  ["orphan-toolbar-toggle-group-multiple", "K9", /NG0201:[\s\S]*ToolbarContext/],
  ["orphan-toolbar-radio-group", "K9", /NG0201:[\s\S]*ToolbarContext/],
  ["trigger", "L2 O3", /trigger/i],
  ["panel", "L2 O3", /panel/i],
  ["popover-trigger", "V1", /trigger/i],
  ["popover-anchor", "V1", /anchor/i],
  ["popover-content", "V1", /content/i],
  ["negative-gap", "V3", /gap/i],
  ["nan-gap", "V3", /gap/i],
  ["infinite-gap", "V3", /gap/i],
  ["orphan-tooltip-trigger", "N12", /NG0201:[\s\S]*TooltipContext/],
  ["orphan-tooltip-content", "N12", /NG0201:[\s\S]*TooltipContext/],
  ["tooltip-trigger", "N1", /Tooltip supports only one mounted trigger/],
  ["tooltip-content", "N1", /Tooltip supports only one mounted content/],
  ["tooltip-negative-gap", "N10", /Tooltip gap must be finite and nonnegative/],
  ["tooltip-nan-gap", "N10", /Tooltip gap must be finite and nonnegative/],
  ["calendar-heading", "CA20", /Calendar supports only one mounted Heading/],
  [
    "calendar-cell-level",
    "CA42",
    // Firefox's captured console arguments escape the quotes.
    /ogCalendarCell: the days view requires a YYYY-MM-DD date[\s\S]*\\?"2026-10\\?"[\s\S]*inert/,
  ],
] as const) {
  test(`${caseId}: ${variant} fails clearly, not via missing imports or arbitrary hydration errors`, async ({
    page,
    issues,
    drainIssues,
    runtimeErrors,
  }, info) => {
    const release = await bootstrapHeld(page, "/errors", info);

    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
    // The fixture's own listeners are live only once it has rendered on the client.
    await expect(page.locator("acceptance-error-fixture")).toHaveAttribute(
      "data-client-render-seen",
      "true",
    );
    await stopRetentionObservation(page);
    await drainIssues();
    expect(issues).toEqual([]);
    await page.getByTestId("error-case").selectOption(variant);
    await expect(page.getByTestId("error-case")).toHaveValue(variant);
    await drainIssues();
    expect(issues).toEqual([]);
    await page.getByTestId("mount-error").click();

    const nativeProductionProvider =
      info.project.metadata.runtime === "production" &&
      [
        "orphan-collection",
        "orphan-accordion",
        "accordion-with-collection",
        "orphan-collapsible-trigger",
        "orphan-collapsible-panel",
        "orphan-accordion-panel",
        "orphan-toolbar-toggle-group-single",
        "orphan-toolbar-toggle-group-multiple",
        "orphan-toolbar-radio-group",
        "orphan-tooltip-trigger",
        "orphan-tooltip-content",
      ].includes(variant);

    if (nativeProductionProvider) {
      const origin = new URL(page.url()).origin;

      runtimeErrors.expectExactly([
        {
          description: "one genuine NG0201 console Error",
          matches: (record) => {
            if (record.source !== "console" || record.captureFailure !== undefined) {
              return false;
            }

            for (const argument of record.arguments ?? []) {
              if (isNativeMissingProviderError(argument, origin)) {
                return true;
              }
            }

            return false;
          },
        },
      ]);
      // Known selected fixture and genuine captured console Error, not arbitrary NG codes or prose.
      await expect
        .poll(async () => {
          await drainIssues();

          let nativeErrors = 0;
          let captureFailures = 0;

          for (const record of runtimeErrors.records) {
            if (record.captureFailure !== undefined) {
              captureFailures += 1;
            }

            if (record.source !== "console") {
              continue;
            }

            for (const argument of record.arguments ?? []) {
              if (isNativeMissingProviderError(argument, origin)) {
                nativeErrors += 1;
              }
            }
          }

          return { records: runtimeErrors.records.length, nativeErrors, captureFailures };
        })
        .toEqual({ records: 1, nativeErrors: 1, captureFailures: 0 });
      await expect(page.getByTestId("error-case")).toHaveValue(variant);
    } else {
      info.annotations.push({ type: "expected-error", description: variant });
      // Development keeps exact CollectionContext/AccordionContext/ToolbarContext distinction. Custom errors keep prose in all modes.
      await expect
        .poll(async () => {
          await drainIssues();

          return issues.join("\n");
        })
        .toMatch(context);
      await drainIssues();
      expect(issues.join("\n")).toMatch(
        /duplicate|one|already|registered|owner|context|ancestor|requires|finite|negative|invalid|nonnegative/i,
      );
    }

    await drainIssues();
    expect(issues.join("\n")).not.toMatch(
      /Cannot find module|does not provide an export|NG050[0-9]|hydration mismatch/i,
    );

    if (variant === "calendar-cell-level") {
      // The month cell in the days view is inert; the day beside it isn't.
      const inert = page.getByTestId("error-calendar-cell");

      await expect(inert).toHaveAttribute("aria-disabled", "true");
      await expect(inert).not.toHaveAttribute("tabindex", /.*/);
      await expect(inert).not.toHaveAttribute("aria-label", /.*/);
      await expect(inert).not.toHaveAttribute("aria-current", /.*/);
      await expect(page.getByTestId("error-calendar-day")).toHaveAttribute(
        "aria-label",
        "Tuesday, October 27, 2026",
      );
      await expect(page.getByTestId("error-calendar-day")).toHaveAttribute("tabindex", "0");
    }
  });
}

function isNativeDomException(record: ErrorRecord, name: string): boolean {
  for (const argument of record.arguments ?? []) {
    if (!isRecord(argument) || argument.name !== name) {
      continue;
    }

    // Console arguments carry their native brand; uncaught page errors carry name/message.
    if (record.source === "pageerror" || argument.type === "[object DOMException]") {
      return true;
    }
  }

  return false;
}

for (const [action, name] of [
  ["detach", "InvalidStateError"],
  ["detach-config", "InvalidStateError"],
  ["remove-mode", "NotSupportedError"],
] as const) {
  test(`V10: same live owner ${action} during native opening surfaces exactly one genuine ${name}`, async ({
    page,
    drainIssues,
    runtimeErrors,
  }, info) => {
    // The final drain must hold exactly this record; any later error still fails the test.
    runtimeErrors.expectExactly([
      {
        description: `one genuine ${name}`,
        matches: (record) => isNativeDomException(record, name),
      },
    ]);
    await fixture(page, "popover", info);
    await drainIssues();
    expect(runtimeErrors.records).toEqual([]);
    await page.getByTestId("owner-lifetime-enable").click();
    await page.getByTestId("owner-lifetime-mount").click();
    await page.getByTestId(`owner-lifetime-arm-${action}`).click();
    // Genuine trusted Trigger activation; the consumer then breaks native ownership while the
    // Angular owner stays alive. The platform failure must not be swallowed.
    await page.getByTestId("owner-lifetime-trigger").click();
    await expect(page.getByTestId("owner-lifetime-settled")).toHaveText("1");
    await expect
      .poll(async () => {
        await drainIssues();

        let native = 0;

        for (const record of runtimeErrors.records) {
          if (isNativeDomException(record, name)) {
            native += 1;
          }
        }

        return { records: runtimeErrors.records.length, native };
      })
      .toEqual({ records: 1, native: 1 });

    const text = await page.getByTestId("owner-lifetime-journal").textContent();
    const entries: unknown = JSON.parse(text ?? "");

    if (!Array.isArray(entries)) {
      throw new Error("Owner journal must be an array");
    }

    let after: unknown = null;
    let destroyed = 0;

    for (const entry of entries) {
      if (isRecord(entry) && entry.stage === "after-action") {
        after = entry;
      }

      if (isRecord(entry) && entry.stage === "destroy-ref") {
        destroyed += 1;
      }
    }

    expect(after).toMatchObject({
      destroyed: false,
      viewDestroyed: false,
      connected: action === "remove-mode",
    });
    expect(destroyed).toBe(0);
    await expect(page.locator("acceptance-native-lifetime-owner")).toHaveCount(1);
  });
}
