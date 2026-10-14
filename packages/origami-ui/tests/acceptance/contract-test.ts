import { test as base, expect } from "playwright/test";
import { attachObservation } from "./observation.js";

export type ErrorRecord = {
  source: string;
  text: string;
  location?: { url: string; lineNumber: number; columnNumber: number };
  arguments?: unknown[];
  captureFailure?: string;
};
export type ErrorExpectation = { description: string; matches: (record: ErrorRecord) => boolean };
type RuntimeErrors = {
  issues: string[];
  records: ErrorRecord[];
  drain: () => Promise<void>;
  /** The final records must be exactly these, in order; anything else fails at teardown. */
  expectExactly: (expected: ErrorExpectation[]) => void;
};

export const test = base.extend<{
  runtimeErrors: RuntimeErrors;
  issues: string[];
  drainIssues: () => Promise<void>;
}>({
  runtimeErrors: [
    async ({ page, browser }, use, testInfo) => {
      const issues: string[] = [];
      const records: ErrorRecord[] = [];
      const pending = new Set<Promise<void>>();
      const expected: ErrorExpectation[] = [];

      async function drain(): Promise<void> {
        while (pending.size) {
          await Promise.all(pending);
        }
      }

      page.on("pageerror", (error) => {
        const text = `${String(error)}\n${error.stack ?? ""}`;

        issues.push(`pageerror: ${text}`);
        records.push({
          source: "pageerror",
          text,
          arguments: [{ name: error.name, message: error.message, stack: error.stack }],
        });
      });
      page.on("console", (message) => {
        if (message.type() !== "error") {
          return;
        }

        // Keep the actual native console text immediately, even if the argument realm disappears.
        const text = message.text();
        const index = issues.push(`console: ${text}`) - 1;
        const record: ErrorRecord = { source: "console", text, location: message.location() };

        records.push(record);

        const capture = Promise.all(
          message.args().map((argument) =>
            argument.evaluate((value: unknown) => {
              if (value === null || (typeof value !== "object" && typeof value !== "function")) {
                return { type: typeof value, value };
              }

              const properties: { name: string; value?: string; accessor: boolean }[] = [];

              for (const name of Object.getOwnPropertyNames(value)) {
                const descriptor = Object.getOwnPropertyDescriptor(value, name);

                if (!descriptor) {
                  throw new Error("Console argument property disappeared during readonly capture");
                }

                if ("value" in descriptor) {
                  properties.push({ name, value: String(descriptor.value), accessor: false });
                } else {
                  properties.push({ name, accessor: true });
                }
              }

              let name: unknown;
              let message: unknown;
              let stack: unknown;

              if ("name" in value) {
                name = value.name;
              }

              if ("message" in value) {
                message = value.message;
              }

              if ("stack" in value) {
                stack = value.stack;
              }

              return {
                type: Object.prototype.toString.call(value),
                name,
                message,
                stack,
                properties,
              };
            }),
          ),
        )
          .then((arguments_) => {
            record.arguments = arguments_;
            issues[index] = `console: ${text}\nactual arguments: ${JSON.stringify(arguments_)}`;
          })
          .catch((error: unknown) => {
            record.captureFailure = String(error);
            issues[index] += `\nconsole argument capture failed: ${String(error)}`;
          });

        pending.add(capture);
        void capture.then(() => pending.delete(capture));
      });
      await use({
        issues,
        records,
        drain,
        expectExactly: (declared) => {
          expected.push(...declared);
        },
      });
      await drain();

      const observed = await page
        .evaluate(() => Boolean(window.acceptanceObservation))
        .catch(() => false);

      if (observed) {
        await attachObservation(page, testInfo);
      }

      await drain();
      await testInfo.attach("engine-runtime-and-errors", {
        body: JSON.stringify(
          {
            engine: testInfo.project.use.browserName,
            engineVersion: browser.version(),
            ...testInfo.project.metadata,
            issues,
            records,
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      if (expected.length > 0) {
        const descriptions: string[] = [];
        const matched: string[] = [];

        for (const expectation of expected) {
          descriptions.push(expectation.description);
        }

        for (const [index, record] of records.entries()) {
          const expectation = expected[index];

          if (expectation !== undefined && expectation.matches(record)) {
            matched.push(expectation.description);
          } else {
            matched.push(`unexpected ${issues[index]}`);
          }
        }

        expect(matched, "Exactly the declared page/console errors").toEqual(descriptions);

        return;
      }

      if (!testInfo.annotations.some((annotation) => annotation.type === "expected-error")) {
        expect(issues, "No page/console/hydration errors").toEqual([]);
      }
    },
    { auto: true },
  ],
  issues: async ({ runtimeErrors }, use) => {
    await use(runtimeErrors.issues);
  },
  drainIssues: async ({ runtimeErrors }, use) => {
    await use(runtimeErrors.drain);
  },
});

export { expect };
