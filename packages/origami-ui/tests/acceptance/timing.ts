import { test as base } from "./contract-test.js";

export type TimerWindow = <Result>(
  exercise: (advance: (ms: number) => Promise<void>) => Promise<Result>,
) => Promise<Result>;

/**
 * Owns the page's application clock for cases that observe a timed window (a warm window, an open
 * delay). The fixture installs Playwright's clock before the case navigates; `timerWindow` pauses
 * it, runs `exercise` with an `advance(ms)` and always resumes it, so a runner stall inside the
 * window moves no browser time.
 *
 * Ownership rule: one sequential owner per browser context. Windows don't nest, and no direct
 * `page.clock` call runs inside or around a window: another page's window, or a direct call, would
 * resume or move this window's clock. Settle preparation (geometry, targets) before the window and
 * make every time-sensitive read inside `exercise`.
 */
export const timingTest = base.extend<{ timerWindow: TimerWindow }>({
  timerWindow: async ({ page }, use) => {
    await page.clock.install();
    await use(async (exercise) => {
      try {
        // pauseAt advances time, up to its 1,000 ms of headroom.
        await base.step(
          "Pause the application clock before starting the timer window",
          async () => {
            const now = await page.evaluate(() => Date.now());

            await page.clock.pauseAt(now + 1000);
          },
        );

        return await exercise((ms) => page.clock.runFor(ms));
      } finally {
        await page.clock.resume();
      }
    });
  },
});
