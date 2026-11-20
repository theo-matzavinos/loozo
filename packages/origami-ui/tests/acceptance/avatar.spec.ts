import { test, expect } from "./contract-test.js";
import type { Page, Request, Route, TestInfo } from "playwright/test";
import {
  assertReferences,
  bootstrapHeld,
  fixture,
  stopRetentionObservation,
} from "./observation.js";

// Avatar (section 35, AV). AV1 is the package, type and documentation gates, AV12 the `errors`
// fixture. Images are `page.route` responses set before navigation, so the server-rendered
// `<img>` requests are caught too: opaque single-colour SVGs, held or failing as each case needs,
// never cached (`no-store`); a failing image is an undecodable 200 response. Pixel probes read screenshots, so they prove what was painted for
// these small opaque fixtures, not first-paint timing for every image.

/** A probe entry as the spec reads it: the fixture's `window.avatarPasses` without the nodes. */
interface Pass {
  readonly index: number;
  readonly testid: string;
  readonly status: string | null;
  readonly src: string | null;
  readonly imageHidden: string | null;
  readonly imageAriaHidden: string | null;
  readonly fallbackHidden: string | null;
}

/** The attributes Avatar owns on a root, its Image and its Fallback. */
interface Attributes {
  readonly status: string | null;
  readonly src: string | null;
  readonly imageHidden: string | null;
  readonly imageAriaHidden: string | null;
  readonly fallbackHidden: string | null;
}

declare global {
  interface Window {
    avatarPasses?: {
      testid: string;
      status: string | null;
      src: string | null;
      imageHidden: string | null;
      imageAriaHidden: string | null;
      fallbackHidden: string | null;
      root: Element;
      image: Element | null;
      fallback: Element | null;
    }[];
    readFixtureSource?: () => string | null;
    avatarServerNodes?: Record<string, (Element | null)[]>;
    avatarFrames?: { testid: string; imageHidden: boolean }[];
    avatarDelay?: { time: number; opacity: string; rendered: boolean }[];
    avatarDelayWindow?: {
      playState: string;
      time: number | null;
      opacity: string;
      fallbackHidden: boolean;
    };
  }
}

const cyanData =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#06b6d4"/></svg>`,
  );

const magentaData =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#d946ef"/></svg>`,
  );

// ---------------------------------------------------------------------------------------------
// Image responses

type Answer = "cyan" | "magenta" | "viewbox" | "undecodable";

/** One response: its answer, and whether it waits for `release`. */
interface Response {
  readonly answer: Answer;
  readonly held: boolean;
}

const svg = {
  cyan: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#06b6d4"/></svg>`,
  magenta: `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#d946ef"/></svg>`,
  viewbox: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#06b6d4"/></svg>`,
} as const;

function serve(answer: Answer): Response {
  return { answer, held: false };
}

function hold(answer: Answer): Response {
  return { answer, held: true };
}

/**
 * The fixture's images and their default responses; a case overrides what it needs. Images in the
 * server's HTML are answered by default: WebKit takes no screenshot until the page's `load` has
 * fired, which a held image delays, so only the cases that take none hold them.
 */
const defaults: Record<string, Response[]> = {
  photo: [serve("cyan")],
  slow: [serve("cyan")],
  broken: [serve("undecodable")],
  viewbox: [serve("viewbox")],
  named: [serve("cyan")],
  "changes-a": [serve("cyan")],
  "changes-b": [serve("magenta")],
  "changes-bad": [serve("undecodable")],
  "changes-failed": [serve("undecodable"), hold("cyan")],
  "changes-race": [hold("undecodable")],
  "direct-a": [serve("cyan")],
  "direct-b": [hold("magenta")],
  "removable-slow": [hold("cyan")],
  "root-named": [hold("cyan")],
  "root-named-broken": [serve("undecodable")],
  delay: [serve("cyan")],
  "delay-held": [hold("magenta")],
  "delay-broken": [serve("undecodable")],
  split: [serve("cyan")],
};

/**
 * How the browser ended one answered request: `finished` once it received the whole response,
 * `failed: …` when it cancelled the request or the response failed.
 */
type Outcome = "finished" | `failed: ${string}`;

/**
 * Serves `/avatar-image/<name>.svg`: each request takes the next of its name's responses (the
 * last repeats), counts, and a held one waits for `release(name)` or `answer(name)`.
 */
class Images {
  readonly #plan: Record<string, Response[]>;
  readonly #requests = new Map<string, number>();
  readonly #held = new Map<string, { resume: () => void; request: Request }[]>();
  readonly #outcomes = new Map<
    Request,
    { promise: Promise<Outcome>; settle: (outcome: Outcome) => void }
  >();
  readonly unexpected: string[] = [];

  constructor(plan: Record<string, Response[]>) {
    this.#plan = plan;
  }

  static async on(page: Page, overrides: Record<string, Response[]> = {}): Promise<Images> {
    const images = new Images({ ...defaults, ...overrides });

    page.on("requestfinished", (request) => images.#settle(request, "finished"));
    page.on("requestfailed", (request) =>
      images.#settle(request, `failed: ${request.failure()?.errorText ?? "unknown"}`),
    );
    await page.route("**/avatar-image/**", (route) => images.#answer(route));

    return images;
  }

  requests(name: string): number {
    return this.#requests.get(name) ?? 0;
  }

  holding(name: string): number {
    return this.#held.get(name)?.length ?? 0;
  }

  /** Answers every request of `name` currently held. */
  release(name: string): void {
    void this.answer(name);
  }

  /**
   * Answers every request of `name` currently held, and resolves with each one's outcome once the
   * browser finished or cancelled it.
   */
  answer(name: string): Promise<Outcome[]> {
    const waiting = this.#held.get(name) ?? [];
    const outcomes: Promise<Outcome>[] = [];

    this.#held.set(name, []);

    for (const { resume, request } of waiting) {
      outcomes.push(this.#outcome(request).promise);
      resume();
    }

    return Promise.all(outcomes);
  }

  #outcome(request: Request): { promise: Promise<Outcome>; settle: (outcome: Outcome) => void } {
    let entry = this.#outcomes.get(request);

    if (entry === undefined) {
      let settle!: (outcome: Outcome) => void;
      const promise = new Promise<Outcome>((resolve) => {
        settle = resolve;
      });

      entry = { promise, settle };
      this.#outcomes.set(request, entry);
    }

    return entry;
  }

  /** Records the first outcome reported for an image request. */
  #settle(request: Request, outcome: Outcome): void {
    if (new URL(request.url()).pathname.includes("/avatar-image/")) {
      this.#outcome(request).settle(outcome);
    }
  }

  async #answer(route: Route): Promise<void> {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    const name = pathname.replace(/^.*\/avatar-image\//, "").replace(/\.svg$/, "");
    const responses = this.#plan[name];

    if (responses === undefined) {
      this.unexpected.push(name);
      await route.fulfill({ status: 500 }).catch(() => {});

      return;
    }

    const count = this.requests(name) + 1;

    this.#requests.set(name, count);

    const response = responses[Math.min(count, responses.length) - 1]!;

    if (response.held) {
      await new Promise<void>((resume) => {
        const waiting = this.#held.get(name) ?? [];

        waiting.push({ resume, request });
        this.#held.set(name, waiting);
      });
    }

    const headers = { "Cache-Control": "no-store" };

    if (response.answer === "undecodable") {
      // A failure without a failing status: engines log a 404 image as a console error, which the
      // harness rejects; an undecodable body fails the image the same way (error, complete with a
      // zero naturalWidth) without a console message.
      await route
        .fulfill({ status: 200, contentType: "image/svg+xml", body: "not an image", headers })
        .catch((error: Error) => this.#settle(request, `failed: ${error.message}`));

      return;
    }

    await route
      .fulfill({ status: 200, contentType: "image/svg+xml", body: svg[response.answer], headers })
      .catch((error: Error) => this.#settle(request, `failed: ${error.message}`));
  }
}

// ---------------------------------------------------------------------------------------------
// Reading avatars

async function read(page: Page, testid: string): Promise<Attributes> {
  return page.getByTestId(testid).evaluate((root) => {
    const image = root.querySelector(":scope > img");
    const fallback = root.querySelector(":scope > [ogavatarfallback]");

    return {
      status: root.getAttribute("data-status"),
      src: image?.getAttribute("src") ?? null,
      imageHidden: image?.getAttribute("hidden") ?? null,
      imageAriaHidden: image?.getAttribute("aria-hidden") ?? null,
      fallbackHidden: fallback?.getAttribute("hidden") ?? null,
    };
  });
}

/** The hidden attributes each status gives the Image and the Fallback. */
function shape(status: "idle" | "loading" | "loaded" | "error"): Omit<Attributes, "src"> {
  if (status === "loading") {
    return { status, imageHidden: null, imageAriaHidden: "true", fallbackHidden: null };
  }

  if (status === "loaded") {
    return { status, imageHidden: null, imageAriaHidden: null, fallbackHidden: "" };
  }

  return { status, imageHidden: "", imageAriaHidden: "true", fallbackHidden: null };
}

/** Waits until the avatar settles at `status`, then checks every attribute it owns. */
async function expectAvatar(
  page: Page,
  testid: string,
  status: "idle" | "loading" | "loaded" | "error",
  src: string | null,
): Promise<void> {
  await expect(page.getByTestId(testid)).toHaveAttribute("data-status", status);
  expect(await read(page, testid)).toEqual({ ...shape(status), src });
}

async function passCount(page: Page): Promise<number> {
  return page.evaluate(() => window.avatarPasses?.length ?? 0);
}

async function passesOf(page: Page, testid: string, after = 0): Promise<Pass[]> {
  return page.evaluate(
    ({ testid, after }) => {
      const passes = window.avatarPasses ?? [];
      const found = [];

      for (let index = after; index < passes.length; index += 1) {
        const pass = passes[index]!;

        if (pass.testid === testid) {
          found.push({
            index,
            testid: pass.testid,
            status: pass.status,
            src: pass.src,
            imageHidden: pass.imageHidden,
            imageAriaHidden: pass.imageAriaHidden,
            fallbackHidden: pass.fallbackHidden,
          });
        }
      }

      return found;
    },
    { testid, after },
  );
}

/**
 * The first after-render pass, after entry `after`, whose Image `src` attribute is `src`: the
 * render that wrote it, read before that pass's reconcile.
 */
async function sourceWritingPass(
  page: Page,
  testid: string,
  src: string | null,
  after: number,
): Promise<Pass> {
  let found: Pass | undefined;

  await expect
    .poll(async () => {
      const passes = await passesOf(page, testid, after);

      found = passes.find((pass) => pass.src === src);

      return found !== undefined;
    })
    .toBe(true);

  return found!;
}

/** Expects the source-writing pass for `src` to have read `status`, with its hidden attributes. */
async function expectWritingPass(
  page: Page,
  testid: string,
  src: string | null,
  after: number,
  status: "idle" | "loading",
): Promise<void> {
  const pass = await sourceWritingPass(page, testid, src, after);

  expect({
    status: pass.status,
    imageHidden: pass.imageHidden,
    imageAriaHidden: pass.imageAriaHidden,
    fallbackHidden: pass.fallbackHidden,
  }).toEqual(shape(status));
}

const palette = {
  image: [6, 182, 212],
  replacement: [217, 70, 239],
  fallback: [180, 83, 9],
} as const;

function classify([red, green, blue]: number[]): string {
  for (const [name, [r, g, b]] of Object.entries(palette)) {
    if (Math.abs(red! - r) <= 40 && Math.abs(green! - g) <= 40 && Math.abs(blue! - b) <= 40) {
      return name;
    }
  }

  return `rgb(${red}, ${green}, ${blue})`;
}

/** A screenshot of the whole avatar, attached to the report. */
async function crop(
  page: Page,
  info: TestInfo,
  testid: string,
  label: string,
): Promise<{ shot: Buffer; clip: { x: number; y: number; width: number; height: number } }> {
  const box = await page.getByTestId(testid).boundingBox();

  expect(box).not.toBeNull();

  const clip = { x: box!.x, y: box!.y, width: box!.width, height: box!.height };
  const shot = await page.screenshot({ clip });

  await info.attach(`${testid}-${label}`, { body: shot, contentType: "image/png" });

  return { shot, clip };
}

/**
 * How many pixels of two screenshots of the same size differ by more than `tolerance` in any
 * channel, and the total.
 */
async function differingPixels(
  page: Page,
  a: Buffer,
  b: Buffer,
  tolerance: number,
): Promise<{ differing: number; total: number }> {
  return page.evaluate(
    async ({ a, b, tolerance }) => {
      async function pixels(base64: string): Promise<ImageData> {
        const image = new Image();

        image.src = `data:image/png;base64,${base64}`;
        await image.decode();

        const canvas = document.createElement("canvas");

        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;

        const context = canvas.getContext("2d")!;

        context.drawImage(image, 0, 0);

        return context.getImageData(0, 0, canvas.width, canvas.height);
      }

      const [first, second] = [await pixels(a), await pixels(b)];

      if (first.width !== second.width || first.height !== second.height) {
        return { differing: Number.POSITIVE_INFINITY, total: first.width * first.height };
      }

      let differing = 0;

      for (let index = 0; index < first.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          if (Math.abs(first.data[index + channel]! - second.data[index + channel]!) > tolerance) {
            differing += 1;
            break;
          }
        }
      }

      return { differing, total: first.width * first.height };
    },
    { a: a.toString("base64"), b: b.toString("base64"), tolerance },
  );
}

/**
 * What the screenshot shows at three corners of the 80 × 80 avatar, away from the centred
 * fallback text and the top-left corner where an engine may draw its broken-image icon.
 */
async function painted(
  page: Page,
  info: TestInfo,
  testid: string,
  label: string,
): Promise<string[]> {
  const { shot, clip } = await crop(page, info, testid, label);

  const points = [
    [72, 8],
    [8, 72],
    [72, 72],
  ];
  const samples = await page.evaluate(
    async ({ base64, points, width }) => {
      const image = new Image();

      image.src = `data:image/png;base64,${base64}`;
      await image.decode();

      const canvas = document.createElement("canvas");

      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;

      const context = canvas.getContext("2d")!;

      context.drawImage(image, 0, 0);

      const scale = image.naturalWidth / width;
      const colours = [];

      for (const [x, y] of points) {
        const pixel = context.getImageData(Math.floor(x! * scale), Math.floor(y! * scale), 1, 1);

        colours.push([pixel.data[0]!, pixel.data[1]!, pixel.data[2]!]);
      }

      return colours;
    },
    { base64: shot.toString("base64"), points, width: clip.width },
  );
  const names = [];

  for (const sample of samples) {
    names.push(classify(sample));
  }

  return names;
}

async function expectPainted(
  page: Page,
  info: TestInfo,
  testid: string,
  label: string,
  colour: keyof typeof palette,
): Promise<void> {
  expect(await painted(page, info, testid, label), `${testid} ${label}`).toEqual([
    colour,
    colour,
    colour,
  ]);
}

/** Lets the page run two frames and any change detection they schedule. */
async function frames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 50);
          });
        });
      }),
  );
}

/**
 * Answers the one held request of `name`, an obsolete source's, and waits until the browser has
 * finished or cancelled it and then run two frames, so a late result has had its chance to land.
 * The outcome is recorded: an engine may cancel an obsolete request, and none must deliver an
 * event for it.
 */
async function expectLateAnswer(
  page: Page,
  info: TestInfo,
  images: Images,
  name: string,
): Promise<void> {
  const outcomes = await images.answer(name);

  info.annotations.push({ type: "late answer", description: `${name}: ${outcomes.join(", ")}` });
  expect(outcomes, `${name}'s held request`).toHaveLength(1);
  await frames(page);
}

function incremental(info: TestInfo): boolean {
  return info.project.metadata.hydration === "incremental";
}

/** Saves each avatar's root, Image and Fallback before hydration, to compare by identity. */
async function saveServerNodes(page: Page, testids: readonly string[]): Promise<void> {
  await page.evaluate((testids) => {
    const nodes: Record<string, (Element | null)[]> = {};

    for (const testid of testids) {
      const root = document.querySelector(`[data-testid="${testid}"]`);

      nodes[testid] = [
        root,
        root?.querySelector(":scope > img") ?? null,
        root?.querySelector(":scope > [ogavatarfallback]") ?? null,
      ];
    }

    window.avatarServerNodes = nodes;
  }, testids);
}

async function imagesComplete(page: Page, testids: readonly string[]): Promise<void> {
  for (const testid of testids) {
    await expect
      .poll(() =>
        page
          .getByTestId(testid)
          .evaluate((root) => (root.querySelector(":scope > img") as HTMLImageElement).complete),
      )
      .toBe(true);
  }
}

/**
 * Loads `url` with bootstrap held and runs `before` while its avatars are still the server's:
 * under eager hydration before the application bootstraps, under incremental hydration once the
 * shell attached with the fixture's block dormant, so the attach click is what hydrates it.
 */
async function hydrateAfter(
  page: Page,
  info: TestInfo,
  before: () => Promise<void>,
  { url = "/avatar", host = "acceptance-avatar-fixture" } = {},
): Promise<void> {
  const fixtureHost = page.locator(host);
  const release = await bootstrapHeld(page, url, info);

  if (incremental(info)) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(fixtureHost).not.toHaveAttribute("data-client-rendered", /.*/);
  await before();
  await expect(fixtureHost).not.toHaveAttribute("data-client-rendered", /.*/);

  if (!incremental(info)) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await page.getByTestId("attach-fixture").click();
  await expect(fixtureHost).toHaveAttribute("data-client-rendered", "true");
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");
}

// ---------------------------------------------------------------------------------------------
// AV2–AV4: the server's avatars and hydration

const firstPassRows = ["photo", "data", "null", "empty", "composer"] as const;

test("AV2 the server HTML, the first client pass and the settled attributes are on the server's nodes", async ({
  page,
}, info) => {
  const images = await Images.on(page);
  const documentResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/avatar" &&
      response.request().resourceType() === "document",
  );
  let server: Record<string, Attributes & { jsaction: boolean }> = {};

  await hydrateAfter(page, info, async () => {
    const raw = await (await documentResponse).text();

    // (1) The response text itself, parsed apart from the live document.
    server = await page.evaluate(
      ({ raw, rows }) => {
        const parsed = new DOMParser().parseFromString(raw, "text/html");
        const found: Record<
          string,
          {
            status: string | null;
            src: string | null;
            imageHidden: string | null;
            imageAriaHidden: string | null;
            fallbackHidden: string | null;
            jsaction: boolean;
          }
        > = {};

        for (const testid of rows) {
          const root = parsed.querySelector(`[data-testid="${testid}"]`)!;
          const image = root.querySelector(":scope > img");
          const fallback = root.querySelector(":scope > [ogavatarfallback]");

          found[testid] = {
            status: root.getAttribute("data-status"),
            src: image?.getAttribute("src") ?? null,
            imageHidden: image?.getAttribute("hidden") ?? null,
            imageAriaHidden: image?.getAttribute("aria-hidden") ?? null,
            fallbackHidden: fallback?.getAttribute("hidden") ?? null,
            jsaction:
              root.hasAttribute("jsaction") ||
              Boolean(image?.hasAttribute("jsaction")) ||
              Boolean(fallback?.hasAttribute("jsaction")),
          };
        }

        return found;
      },
      { raw, rows: [...firstPassRows] },
    );

    expect(server).toEqual({
      photo: { ...shape("loading"), src: "/avatar-image/photo.svg", jsaction: false },
      data: { ...shape("loading"), src: cyanData, jsaction: false },
      null: { ...shape("idle"), src: null, jsaction: false },
      empty: { ...shape("idle"), src: null, jsaction: false },
      composer: { ...shape("loading"), src: cyanData, jsaction: false },
    });
    await saveServerNodes(page, firstPassRows);
    await imagesComplete(page, ["photo", "data", "composer"]);
  });

  // (2) The first after-render pass: what the first client binding pass wrote, before any
  // readiness observation, on the server's nodes.
  for (const testid of firstPassRows) {
    const [first] = await passesOf(page, testid);
    const { jsaction, ...attributes } = server[testid]!;

    expect(jsaction).toBe(false);
    expect(first, `${testid}'s first client pass`).toEqual({
      index: first?.index,
      testid,
      ...attributes,
    });
    expect(
      await page.evaluate((testid) => {
        const pass = window.avatarPasses!.find((entry) => entry.testid === testid)!;
        const saved = window.avatarServerNodes![testid]!;

        return pass.root === saved[0] && pass.image === saved[1] && pass.fallback === saved[2];
      }, testid),
      `${testid}'s first pass read the server's nodes`,
    ).toBe(true);
  }

  // (3) Settled.
  await expectAvatar(page, "photo", "loaded", "/avatar-image/photo.svg");
  await expectAvatar(page, "data", "loaded", cyanData);
  await expectAvatar(page, "composer", "loaded", cyanData);
  await expectAvatar(page, "null", "idle", null);
  await expectAvatar(page, "empty", "idle", null);
  expect(await page.locator("[ogavatar] [jsaction], [ogavatar][jsaction]").count()).toBe(0);
  expect(images.unexpected).toEqual([]);
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});

test("AV3 images complete before hydration stay painted and are adopted when it attaches", async ({
  page,
  browserName,
}, info) => {
  // Firefox and WebKit take no screenshot while the page is still loading, as it is while eager
  // hydration's bootstrap is held here (main.js pending); their pre-hydration pixels come from
  // the incremental cells, where the page has loaded and the block is dormant.
  const screenshotBeforeHydration = browserName === "chromium" || incremental(info);

  if (!screenshotBeforeHydration) {
    info.annotations.push({
      type: "limit",
      description: `no screenshot in ${browserName} while main.js is held`,
    });
  }

  await page.addInitScript(() => {
    // Every frame from the first one: whether a loaded row's image was ever hidden.
    const frames: { testid: string; imageHidden: boolean }[] = [];

    window.avatarFrames = frames;

    function sample(): void {
      for (const testid of ["photo", "data"]) {
        const image = document.querySelector(`[data-testid="${testid}-image"]`);

        if (image !== null) {
          frames.push({ testid, imageHidden: image.hasAttribute("hidden") });
        }
      }

      requestAnimationFrame(sample);
    }

    requestAnimationFrame(sample);
  });

  const images = await Images.on(page);

  await hydrateAfter(page, info, async () => {
    await imagesComplete(page, ["photo", "data", "broken"]);
    expect(images.requests("broken")).toBe(1);
    await expect(page.getByTestId("photo")).toHaveAttribute("data-status", "loading");

    if (!screenshotBeforeHydration) {
      return;
    }

    await expectPainted(page, info, "photo", "before-hydration", "image");
    await expectPainted(page, info, "data", "before-hydration", "image");
    // The engine may draw its broken-image chrome over the fallback; the corners away from it
    // show the fallback.
    expect((await painted(page, info, "broken", "before-hydration")).slice(1)).toEqual([
      "fallback",
      "fallback",
    ]);
  });

  await expectAvatar(page, "photo", "loaded", "/avatar-image/photo.svg");
  await expectAvatar(page, "data", "loaded", cyanData);
  await expectAvatar(page, "broken", "error", "/avatar-image/broken.svg");
  await expectPainted(page, info, "photo", "attached", "image");
  await expectPainted(page, info, "data", "attached", "image");
  await expectPainted(page, info, "broken", "attached", "fallback");

  const frames = await page.evaluate(() => window.avatarFrames!);

  expect(frames.length).toBeGreaterThan(0);
  expect(frames.filter((frame) => frame.imageHidden)).toEqual([]);
});

test("AV3 the status of an image complete before hydration is read from the element, not from its events", async ({
  page,
  browserName,
}, info) => {
  // Hydration writes each `src` again, unchanged, and every engine then fires `load` or `error`
  // once more, after the Image's listeners exist. With every Avatar image event swallowed before
  // it reaches the image, only the Image's own first reconcile can settle the status. A failed
  // image isn't used: Chromium and Firefox request it again on that write, so it is loading
  // again when the Image first reconciles, and its new `error` is what settles it. Firefox also
  // resets a loaded image's `complete` on that write until its re-fired `load`, so there the
  // event, not the first reconcile, settles it: with events swallowed it stays `loading`.
  await page.addInitScript(() => {
    for (const type of ["load", "error"]) {
      document.addEventListener(
        type,
        (event) => {
          if (
            event.target instanceof HTMLImageElement &&
            event.target.hasAttribute("ogavatarimage")
          ) {
            event.stopImmediatePropagation();
          }
        },
        true,
      );
    }
  });
  await Images.on(page);
  await hydrateAfter(page, info, async () => {
    await imagesComplete(page, ["photo", "data"]);
  });

  if (browserName === "firefox") {
    info.annotations.push({
      type: "branch",
      description: "Firefox resets complete on hydration's src write; the re-fired load settles it",
    });
    await imagesComplete(page, ["photo", "data", "composer"]);
    await frames(page);
    await expectAvatar(page, "photo", "loading", "/avatar-image/photo.svg");
    await expectAvatar(page, "data", "loading", cyanData);
    await expectAvatar(page, "composer", "loading", cyanData);

    return;
  }

  await expectAvatar(page, "photo", "loaded", "/avatar-image/photo.svg");
  await expectAvatar(page, "data", "loaded", cyanData);
  await expectAvatar(page, "composer", "loaded", cyanData);
});

test("AV4 image events before hydration hydrate nothing and are adopted when it attaches", async ({
  page,
}, info) => {
  // Hydration writes each `src` again, unchanged, which makes Chromium and Firefox request an
  // image that already failed once more; that retry is answered at once.
  const images = await Images.on(page, {
    slow: [hold("cyan")],
    broken: [hold("undecodable"), serve("undecodable")],
  });

  // Under incremental hydration the block is dormant with the shell attached; under eager
  // hydration bootstrap is held. Either way the images finish while their avatars are the
  // server's, and nothing hydrates or changes for it.
  await hydrateAfter(page, info, async () => {
    expect(await page.locator("[ogavatar] [jsaction], [ogavatar][jsaction]").count()).toBe(0);
    await expect.poll(() => images.holding("slow")).toBe(1);
    await expect.poll(() => images.holding("broken")).toBe(1);
    images.release("slow");
    images.release("broken");
    await imagesComplete(page, ["slow", "broken"]);
    await page.waitForTimeout(1000);
    await expect(page.locator("acceptance-avatar-fixture")).not.toHaveAttribute(
      "data-client-rendered",
      /.*/,
    );
    await expect(page.getByTestId("slow")).toHaveAttribute("data-status", "loading");
    await expect(page.getByTestId("broken")).toHaveAttribute("data-status", "loading");
  });

  await expectAvatar(page, "slow", "loaded", "/avatar-image/slow.svg");
  await expectAvatar(page, "broken", "error", "/avatar-image/broken.svg");
  info.annotations.push({
    type: "requests",
    description: `slow ${images.requests("slow")}, broken ${images.requests("broken")}`,
  });
});

// ---------------------------------------------------------------------------------------------
// AV5–AV8: after hydration

/** `naturalWidth` and status each engine reports for an SVG with a `viewBox` and no width. */
const viewBoxSvg = {
  chromium: { naturalWidth: 150, status: "loaded" },
  firefox: { naturalWidth: 300, status: "loaded" },
  webkit: { naturalWidth: 150, status: "loaded" },
} as const;

test("AV5 a held image loads or fails once it is answered, and a viewBox-only SVG reads its engine's width", async ({
  page,
  browserName,
}, info) => {
  const images = await Images.on(page, { slow: [hold("cyan")], broken: [hold("undecodable")] });

  await fixture(page, "avatar", info);
  await expectAvatar(page, "slow", "loading", "/avatar-image/slow.svg");
  await expectAvatar(page, "broken", "loading", "/avatar-image/broken.svg");
  // Hydration writes each `src` again, unchanged; Firefox restarts a pending image's request on
  // that write, so a server-rendered image still loading when it hydrates is requested twice
  // there (Chromium and WebKit reuse the request).
  await expect.poll(() => images.holding("slow")).toBeGreaterThanOrEqual(1);
  await expect.poll(() => images.holding("broken")).toBeGreaterThanOrEqual(1);
  await frames(page);
  info.annotations.push({
    type: "requests",
    description: `slow ${images.requests("slow")}, broken ${images.requests("broken")}`,
  });
  await expectAvatar(page, "slow", "loading", "/avatar-image/slow.svg");

  images.release("slow");
  await expectAvatar(page, "slow", "loaded", "/avatar-image/slow.svg");
  images.release("broken");
  await expectAvatar(page, "broken", "error", "/avatar-image/broken.svg");

  // The viewBox-only SVG: what this engine reports, recorded, then compared with its row.
  await imagesComplete(page, ["viewbox"]);
  await expect(page.getByTestId("viewbox")).not.toHaveAttribute("data-status", "loading");

  const observed = {
    naturalWidth: await page
      .getByTestId("viewbox-image")
      .evaluate((image: HTMLImageElement) => image.naturalWidth),
    status: (await read(page, "viewbox")).status,
  };

  await info.attach(`viewbox-${browserName}`, {
    body: JSON.stringify(observed),
    contentType: "application/json",
  });
  expect(observed).toEqual(viewBoxSvg[browserName]);
  await expectAvatar(page, "viewbox", viewBoxSvg[browserName].status, "/avatar-image/viewbox.svg");
});

const changesA = "/avatar-image/changes-a.svg";
const changesB = "/avatar-image/changes-b.svg";

/** Attaches the fixture with the changes avatar loaded with A. */
async function changesLoaded(page: Page, info: TestInfo): Promise<void> {
  await fixture(page, "avatar", info);
  await expectAvatar(page, "changes", "loaded", changesA);
  await expectPainted(page, info, "changes", "A", "image");
}

test("AV6 a replacement reads loading in the render that writes it and keeps the old pixels until it loads", async ({
  page,
}, info) => {
  const images = await Images.on(page, { "changes-b": [hold("magenta")] });

  await changesLoaded(page, info);

  const before = await passCount(page);

  await page.getByTestId("changes-b").click();
  await expectWritingPass(page, "changes", changesB, before, "loading");
  await expect.poll(() => images.holding("changes-b")).toBe(1);
  await expectAvatar(page, "changes", "loading", changesB);
  await expectPainted(page, info, "changes", "B-pending", "image");
  images.release("changes-b");
  await expectAvatar(page, "changes", "loaded", changesB);
  await expectPainted(page, info, "changes", "B-loaded", "replacement");
});

test("AV6 a fast replacement settles loaded with its own pixels", async ({ page }, info) => {
  await Images.on(page);
  await changesLoaded(page, info);

  const before = await passCount(page);

  await page.getByTestId("changes-b").click();
  await expectWritingPass(page, "changes", changesB, before, "loading");
  await expectAvatar(page, "changes", "loaded", changesB);
  await expectPainted(page, info, "changes", "B-loaded", "replacement");
});

test("AV6 a failing replacement keeps the old pixels while pending, then shows the fallback; empty and null are idle", async ({
  page,
}, info) => {
  const images = await Images.on(page, { "changes-bad": [hold("undecodable")] });
  const bad = "/avatar-image/changes-bad.svg";

  await changesLoaded(page, info);

  let before = await passCount(page);

  await page.getByTestId("changes-bad").click();
  await expectWritingPass(page, "changes", bad, before, "loading");
  await expect.poll(() => images.holding("changes-bad")).toBe(1);
  await expectAvatar(page, "changes", "loading", bad);
  await expectPainted(page, info, "changes", "bad-pending", "image");
  images.release("changes-bad");
  await expectAvatar(page, "changes", "error", bad);
  await expectPainted(page, info, "changes", "bad-failed", "fallback");

  await page.getByTestId("changes-a").click();
  await expectAvatar(page, "changes", "loaded", changesA);
  before = await passCount(page);
  await page.getByTestId("changes-empty").click();
  await expectWritingPass(page, "changes", null, before, "idle");
  await expectAvatar(page, "changes", "idle", null);
  await expectPainted(page, info, "changes", "empty", "fallback");

  await page.getByTestId("changes-a").click();
  await expectAvatar(page, "changes", "loaded", changesA);
  before = await passCount(page);
  await page.getByTestId("changes-null").click();
  await expectWritingPass(page, "changes", null, before, "idle");
  await expectAvatar(page, "changes", "idle", null);
  await expectPainted(page, info, "changes", "null", "fallback");
});

test("AV6 a race between a slow failing source and a complete one ends on the complete one", async ({
  page,
}, info) => {
  const images = await Images.on(page);
  const race = "/avatar-image/changes-race.svg";

  await changesLoaded(page, info);

  const before = await passCount(page);

  await page.getByTestId("changes-race").click();
  await expectWritingPass(page, "changes", race, before, "loading");
  // Precondition: the failing request began, and is held, before the source goes back to A.
  await expect.poll(() => images.holding("changes-race")).toBe(1);

  const afterRace = (await sourceWritingPass(page, "changes", race, before)).index;

  await page.getByTestId("changes-a").click();
  await expectWritingPass(page, "changes", changesA, afterRace, "loading");
  await expectAvatar(page, "changes", "loaded", changesA);
  await expectLateAnswer(page, info, images, "changes-race");
  await expectAvatar(page, "changes", "loaded", changesA);
  await expectPainted(page, info, "changes", "race-settled", "image");
});

test("AV6 from error to a pending replacement, the image isn't hidden and only the fallback is painted", async ({
  page,
}, info) => {
  const images = await Images.on(page, { "changes-b": [hold("magenta")] });
  const bad = "/avatar-image/changes-bad.svg";

  await changesLoaded(page, info);
  // The reference: the same avatar idle, with only its Fallback painted.
  await page.getByTestId("changes-null").click();
  await expectAvatar(page, "changes", "idle", null);

  const idle = await crop(page, info, "changes", "idle-reference");

  await page.getByTestId("changes-bad").click();
  await expectAvatar(page, "changes", "error", bad);

  const before = await passCount(page);

  await page.getByTestId("changes-b").click();
  await expectWritingPass(page, "changes", changesB, before, "loading");
  await expect.poll(() => images.holding("changes-b")).toBe(1);
  await expectAvatar(page, "changes", "loading", changesB);

  // The whole avatar matches the idle Fallback: no broken-image icon, border or other chrome from
  // the unhidden, still pending image. Prototype-2 measured exactly the fallback here in every
  // engine for these fixtures; the tolerance only absorbs anti-aliasing noise, far below an
  // icon's or a 1px border's pixel count.
  const pending = await crop(page, info, "changes", "error-to-pending");
  const difference = await differingPixels(page, idle.shot, pending.shot, 24);

  info.annotations.push({
    type: "error to pending",
    description: `${difference.differing} of ${difference.total} pixels differ from the idle fallback`,
  });
  expect(difference.differing, "pixels differing from the idle fallback").toBeLessThanOrEqual(16);
  await expectPainted(page, info, "changes", "error-to-pending", "fallback");
  images.release("changes-b");
  await expectAvatar(page, "changes", "loaded", changesB);
  await expectPainted(page, info, "changes", "error-to-loaded", "replacement");
});

test("AV6 loaded A, then null, then A again reads loading in the render that writes A", async ({
  page,
}, info) => {
  const images = await Images.on(page, { "changes-a": [serve("cyan"), hold("cyan")] });

  await changesLoaded(page, info);
  await page.getByTestId("changes-null").click();
  await expectAvatar(page, "changes", "idle", null);

  const before = await passCount(page);

  await page.getByTestId("changes-a").click();
  // Round 1's URL-keyed observation (M1) reads the old `loaded` here.
  await expectWritingPass(page, "changes", changesA, before, "loading");
  await expect
    .poll(async () => {
      const { status } = await read(page, "changes");

      return images.holding("changes-a") === 1 || status === "loaded";
    })
    .toBe(true);

  if (images.holding("changes-a") === 1) {
    // Chromium and WebKit request A again.
    info.annotations.push({ type: "branch", description: "A requested again and held" });
    expect(images.requests("changes-a")).toBe(2);
    await frames(page);
    await expectAvatar(page, "changes", "loading", changesA);
    images.release("changes-a");
  } else {
    // Firefox keeps A in its list of available images.
    info.annotations.push({ type: "branch", description: "A reused without a second request" });
    expect(images.requests("changes-a")).toBe(1);
  }

  await expectAvatar(page, "changes", "loaded", changesA);
  await expectPainted(page, info, "changes", "A-again", "image");
});

test("AV6 failed A, then null, then A again retries it: loading with the image shown while it is held", async ({
  page,
}, info) => {
  const images = await Images.on(page);
  const failed = "/avatar-image/changes-failed.svg";

  await fixture(page, "avatar", info);
  await page.getByTestId("changes-failed").click();
  await expectAvatar(page, "changes", "error", failed);
  await page.getByTestId("changes-null").click();
  await expectAvatar(page, "changes", "idle", null);

  const before = await passCount(page);

  await page.getByTestId("changes-failed").click();
  await expectWritingPass(page, "changes", failed, before, "loading");
  // Precondition: the retry reached the route, which holds it.
  await expect.poll(() => images.holding("changes-failed")).toBe(1);
  expect(images.requests("changes-failed")).toBe(2);
  await frames(page);
  // Round 1's URL-keyed observation (M1) reads `error` with the image hidden here.
  await expectAvatar(page, "changes", "loading", failed);
  await expectPainted(page, info, "changes", "retry-pending", "fallback");
  images.release("changes-failed");
  await expectAvatar(page, "changes", "loaded", failed);
  await expectPainted(page, info, "changes", "retry-loaded", "image");
});

test("AV6 A, then a pending B, then A again settles on A; B's late answer changes nothing", async ({
  page,
}, info) => {
  const images = await Images.on(page, { "changes-b": [hold("magenta")] });

  await changesLoaded(page, info);
  await page.getByTestId("changes-b").click();
  await expect.poll(() => images.holding("changes-b")).toBe(1);
  await expectAvatar(page, "changes", "loading", changesB);

  const before = await passCount(page);

  await page.getByTestId("changes-a").click();
  await expectWritingPass(page, "changes", changesA, before, "loading");
  await expectAvatar(page, "changes", "loaded", changesA);
  await expectPainted(page, info, "changes", "A-back", "image");
  await expectLateAnswer(page, info, images, "changes-b");
  await expectAvatar(page, "changes", "loaded", changesA);
  await expectPainted(page, info, "changes", "after-B-answer", "image");
});

test("AV6 a synthetic error event on the loaded image changes nothing: the status is read from the element", async ({
  page,
}, info) => {
  await Images.on(page);
  await changesLoaded(page, info);

  // Labelled synthetic notification: the wrong kind for the element's actual state.
  const preconditions = await page
    .getByTestId("changes-image")
    .evaluate((image: HTMLImageElement) => {
      const state = {
        status: image.parentElement!.getAttribute("data-status"),
        complete: image.complete,
        naturalWidth: image.naturalWidth,
        src: image.getAttribute("src"),
      };

      image.dispatchEvent(new Event("error"));

      return state;
    });

  expect(preconditions.status).toBe("loaded");
  expect(preconditions.complete).toBe(true);
  expect(preconditions.naturalWidth).toBeGreaterThan(0);
  expect(preconditions.src).toBe(changesA);
  await frames(page);
  // Status taken from the event's type (M2) reads `error` with the image hidden here.
  await expectAvatar(page, "changes", "loaded", changesA);
});

test("AV6 a synthetic load before a direct-Options source's binding commits writes nothing for the new source", async ({
  page,
}, info) => {
  const images = await Images.on(page);
  const directA = "/avatar-image/direct-a.svg";
  const directB = "/avatar-image/direct-b.svg";

  await fixture(page, "avatar", info);
  await expectAvatar(page, "direct", "loaded", directA);

  // One synchronous turn: the click writes the fixture's signal, which is the effective source
  // at once; change detection is only scheduled (zoneless), so the attribute is still A. Then a
  // labelled synthetic `load` on the img, whose A is complete.
  const preconditions = await page.evaluate(() => {
    const image = document.querySelector<HTMLImageElement>('[data-testid="direct-image"]')!;

    document.querySelector<HTMLButtonElement>('[data-testid="direct-b"]')!.click();

    const source = window.readFixtureSource!();
    const before = image.getAttribute("src");

    image.dispatchEvent(new Event("load"));

    return { source, before, complete: image.complete, width: image.naturalWidth };
  });

  expect(preconditions).toEqual({
    source: directB,
    before: directA,
    complete: true,
    width: preconditions.width,
  });
  expect(preconditions.width).toBeGreaterThan(0);
  await expect.poll(() => images.holding("direct-b")).toBe(1);
  await frames(page);
  // Without the attribute guard (M3) A's result lands on B: `loaded` with the Fallback hidden.
  await expectAvatar(page, "direct", "loading", directB);
  images.release("direct-b");
  await expectAvatar(page, "direct", "loaded", directB);
});

test("AV7 a removed Image leaves its root idle, a remounted one reconciles fresh, a destroyed one's late load changes nothing", async ({
  page,
}, info) => {
  const images = await Images.on(page);
  const removableSlow = "/avatar-image/removable-slow.svg";

  await fixture(page, "avatar", info);
  await expectAvatar(page, "removable", "loaded", cyanData);
  await page.getByTestId("removable-unmount").click();
  await expect(page.getByTestId("removable-image")).toHaveCount(0);
  await expect(page.getByTestId("removable")).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("removable-fallback")).not.toHaveAttribute("hidden", /.*/);
  await page.getByTestId("removable-mount").click();
  await expectAvatar(page, "removable", "loaded", cyanData);

  await page.getByTestId("removable-slow").click();
  await expectAvatar(page, "removable", "loading", removableSlow);
  await expect.poll(() => images.holding("removable-slow")).toBe(1);
  await page.getByTestId("removable-unmount").click();
  await expect(page.getByTestId("removable")).toHaveAttribute("data-status", "idle");
  await expectLateAnswer(page, info, images, "removable-slow");
  await expect(page.getByTestId("removable")).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("removable-fallback")).not.toHaveAttribute("hidden", /.*/);

  await expect(page.getByTestId("fallback-only")).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("fallback-only-fallback")).not.toHaveAttribute("hidden", /.*/);
});

test("AV8 a composer, replaced Image Options, nested roots and the template reference", async ({
  page,
}, info) => {
  await Images.on(page);
  await fixture(page, "avatar", info);

  // The composer's projected Fallback follows its root.
  await expectAvatar(page, "composer", "loaded", cyanData);

  // Factory Options from a wrapper input, and an existing provider.
  await expectAvatar(page, "factory", "idle", null);
  await page.getByTestId("factory-set").click();
  await expectAvatar(page, "factory", "loaded", cyanData);
  await expectAvatar(page, "existing", "idle", null);
  await page.getByTestId("existing-set").click();
  await expectAvatar(page, "existing", "loaded", magentaData);

  // Nested roots are independent.
  await expectAvatar(page, "outer", "idle", null);
  await expect(page.getByTestId("inner")).toHaveAttribute("data-status", "loaded");
  await page.getByTestId("outer-set").click();
  await expectAvatar(page, "outer", "loaded", cyanData);
  await expect(page.getByTestId("inner")).toHaveAttribute("data-status", "loaded");
  await expect(page.getByTestId("inner-fallback")).toHaveAttribute("hidden", "");

  // `#changes="ogAvatar"` reads the status.
  await expect(page.getByTestId("changes")).toHaveAttribute("data-status", "loaded");
  await expect(page.getByTestId("changes-status")).toHaveText("loaded");
  await page.getByTestId("changes-null").click();
  await expect(page.getByTestId("changes-status")).toHaveText("idle");
});

// ---------------------------------------------------------------------------------------------
// AV9: accessibility

test("AV9 exactly one of the image and the fallback is exposed, and a root-named avatar keeps its one name", async ({
  page,
  browserName,
}, info) => {
  const images = await Images.on(page, { named: [hold("cyan")] });

  await fixture(page, "avatar", info);

  const snapshots: Record<string, string> = {};

  // A named avatar: the fallback text while loading, the image's alt once loaded.
  await expectAvatar(page, "named", "loading", "/avatar-image/named.svg");
  snapshots["named-loading"] = await page.getByTestId("named").ariaSnapshot();
  expect(snapshots["named-loading"]).toBe("- text: Theo Matzavinos");
  await expect.poll(() => images.holding("named")).toBeGreaterThanOrEqual(1);
  images.release("named");
  await expectAvatar(page, "named", "loaded", "/avatar-image/named.svg");
  snapshots["named-loaded"] = await page.getByTestId("named").ariaSnapshot();
  expect(snapshots["named-loaded"]).toBe('- img "Theo Matzavinos"');

  // A root-named avatar: one img named by the root through every status.
  const rootNamed = page.getByTestId("root-named");

  await expect(rootNamed).toHaveAttribute("data-status", "idle");
  snapshots["root-named-idle"] = await rootNamed.ariaSnapshot();
  await page.getByTestId("root-named-load").click();
  await expect(rootNamed).toHaveAttribute("data-status", "loading");
  snapshots["root-named-loading"] = await rootNamed.ariaSnapshot();
  await expect.poll(() => images.holding("root-named")).toBe(1);
  images.release("root-named");
  await expect(rootNamed).toHaveAttribute("data-status", "loaded");
  snapshots["root-named-loaded"] = await rootNamed.ariaSnapshot();
  await page.getByTestId("root-named-broken").click();
  await expect(rootNamed).toHaveAttribute("data-status", "error");
  snapshots["root-named-error"] = await rootNamed.ariaSnapshot();

  for (const status of ["idle", "loading", "loaded", "error"]) {
    expect(snapshots[`root-named-${status}`], status).toBe('- img "Theo Matzavinos"');
  }

  // A decorative avatar in a named button: the button's name is its own.
  const account = page.getByTestId("account");

  await expect(account).toHaveAccessibleName("Account");
  snapshots.account = await account.ariaSnapshot();
  expect(snapshots.account).toBe('- button "Account"');

  await info.attach(`accessibility-${browserName}`, {
    body: JSON.stringify(snapshots, null, 2),
    contentType: "application/json",
  });
});

// ---------------------------------------------------------------------------------------------
// AV10–AV11: a split boundary and the fallback-delay recipe

test("AV10 an Image in its own hydrate boundary leaves its root idle until it hydrates, on the server's node", async ({
  page,
}, info) => {
  await Images.on(page);

  const release = await bootstrapHeld(page, "/avatar-split", info);

  if (!incremental(info)) {
    // Without incremental hydration the server renders the block's placeholder, so the root has
    // no Image there, and the browser renders the Image once the block's default trigger fires.
    await expect(page.getByTestId("split-image")).toHaveCount(0);
    await expect(page.getByTestId("split")).toHaveAttribute("data-status", "idle");
    await expect(page.getByTestId("split-fallback")).not.toHaveAttribute("hidden", /.*/);
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
    await page.getByTestId("attach-fixture").click();
    await expect(page.getByTestId("split")).toHaveAttribute("data-status", "loaded");
    await expect(page.getByTestId("split-fallback")).toHaveAttribute("hidden", "");
    await expect(page.getByTestId("split-image")).not.toHaveAttribute("aria-hidden", /.*/);
    await expectPainted(page, info, "split", "image-rendered", "image");
    await assertReferences(page, info);
    await stopRetentionObservation(page);

    return;
  }

  await expect(page.getByTestId("split")).toHaveAttribute("data-status", "loading");
  await page.evaluate(() => {
    window.avatarServerNodes = {
      split: [document.querySelector('[data-testid="split-image"]')],
    };
  });
  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await page.getByTestId("attach-fixture").click();
  await expect(page.locator("acceptance-avatar-split-fixture")).toHaveAttribute(
    "data-client-rendered",
    "true",
  );
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");

  // The root hydrated, its Image didn't: nothing registered, the server's image still painted.
  await expect(page.getByTestId("split")).toHaveAttribute("data-status", "idle");
  await expect(page.getByTestId("split-fallback")).not.toHaveAttribute("hidden", /.*/);
  await expect(page.locator("acceptance-avatar-split-image")).not.toHaveAttribute(
    "data-client-rendered",
    /.*/,
  );
  await expect
    .poll(() =>
      page
        .getByTestId("split-image")
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await expectPainted(page, info, "split", "image-dormant", "image");

  await page.getByTestId("split-hydrate-image").click();
  await expect(page.getByTestId("split")).toHaveAttribute("data-status", "loaded");
  await expect(page.getByTestId("split-fallback")).toHaveAttribute("hidden", "");
  await expect(page.getByTestId("split-image")).not.toHaveAttribute("aria-hidden", /.*/);
  expect(
    await page.evaluate(
      () =>
        document.querySelector('[data-testid="split-image"]') ===
        window.avatarServerNodes!.split![0],
    ),
  ).toBe(true);
  await expectPainted(page, info, "split", "image-hydrated", "image");
  await assertReferences(page, info);
  await stopRetentionObservation(page);
});

test("AV11 the fallback-delay recipe keeps the fallback transparent but exposed for 600 ms before hydration, and an error inside a delay window shows it at once", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    // Every frame: the recipe animation's own clock, the Fallback's opacity, and whether the
    // fixture has rendered in the browser.
    const samples: { time: number; opacity: string; rendered: boolean }[] = [];

    window.avatarDelay = samples;

    function sample(): void {
      const fallback = document.querySelector('[data-testid="delay-fallback"]');
      const animation = fallback?.getAnimations()[0];

      const now = document.timeline.currentTime;

      // The recipe animation's own clock: its `currentTime` stops at 600 ms once it has
      // finished, so the time since it started is read from the document timeline.
      if (
        fallback &&
        animation &&
        typeof animation.startTime === "number" &&
        typeof now === "number"
      ) {
        samples.push({
          time: now - animation.startTime,
          opacity: getComputedStyle(fallback).opacity,
          rendered: Boolean(
            document
              .querySelector("acceptance-avatar-fixture")
              ?.hasAttribute("data-client-rendered"),
          ),
        });
      }

      requestAnimationFrame(sample);
    }

    requestAnimationFrame(sample);
  });

  const images = await Images.on(page, { delay: [hold("cyan")] });
  const host = page.locator("acceptance-avatar-fixture");
  const release = await bootstrapHeld(page, "/avatar", info);

  if (incremental(info)) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await expect(page.getByTestId("delay")).toHaveAttribute("data-status", "loading");
  await expect
    .poll(() => page.evaluate(() => window.avatarDelay!.at(-1)?.time ?? 0))
    .toBeGreaterThanOrEqual(900);
  await expect(host).not.toHaveAttribute("data-client-rendered", /.*/);

  const samples = await page.evaluate(() => window.avatarDelay!.slice());

  await info.attach("delay-samples", {
    body: JSON.stringify(samples, null, 2),
    contentType: "application/json",
  });
  expect(samples.filter((entry) => entry.rendered)).toEqual([]);
  expect(samples.some((entry) => entry.time < 580)).toBe(true);
  expect(samples.some((entry) => entry.time > 620)).toBe(true);

  for (const entry of samples) {
    if (entry.time < 590) {
      expect(entry.opacity, `at ${entry.time} ms`).toBe("0");
    }

    if (entry.time > 610) {
      expect(entry.opacity, `at ${entry.time} ms`).toBe("1");
    }
  }

  if (!incremental(info)) {
    release();
    await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  }

  await page.getByTestId("attach-fixture").click();
  await expect(host).toHaveAttribute("data-client-rendered", "true");
  expect(images.holding("delay")).toBeGreaterThanOrEqual(1);
  images.release("delay");
  await expectAvatar(page, "delay", "loaded", "/avatar-image/delay.svg");

  // A fresh delay window: loaded to loading starts the recipe's animation again. As soon as the
  // status is `loading` its animation is paused inside the window, so the window can't expire
  // before the failure, however slow the runner.
  await page.evaluate(() => {
    const root = document.querySelector('[data-testid="delay"]')!;
    const fallback = document.querySelector<HTMLElement>('[data-testid="delay-fallback"]')!;
    const observer = new MutationObserver(() => {
      if (root.getAttribute("data-status") !== "loading") {
        return;
      }

      observer.disconnect();

      const animation = fallback.getAnimations()[0];

      animation?.pause();
      window.avatarDelayWindow = {
        playState: animation?.playState ?? "none",
        time: typeof animation?.currentTime === "number" ? animation.currentTime : null,
        opacity: getComputedStyle(fallback).opacity,
        fallbackHidden: fallback.hasAttribute("hidden"),
      };
    });

    observer.observe(root, { attributes: true, attributeFilter: ["data-status"] });
  });
  await page.getByTestId("delay-held").click();
  await expect.poll(() => images.holding("delay-held")).toBe(1);
  await expect(page.getByTestId("delay")).toHaveAttribute("data-status", "loading");

  // Preconditions: the Fallback is unhidden but transparent, inside a paused, unexpired window.
  const delayWindow = await page.evaluate(() => window.avatarDelayWindow);

  await info.attach("delay-window", {
    body: JSON.stringify(delayWindow, null, 2),
    contentType: "application/json",
  });
  expect(delayWindow).toEqual({
    playState: "paused",
    time: delayWindow?.time,
    opacity: "0",
    fallbackHidden: false,
  });
  expect(delayWindow!.time).not.toBeNull();
  expect(delayWindow!.time!).toBeLessThan(600);
  expect(
    await page
      .getByTestId("delay-fallback")
      .evaluate((fallback) => getComputedStyle(fallback).opacity),
  ).toBe("0");

  // Inside the window the Image is still `aria-hidden`, so the Fallback's text is the avatar's
  // only content in the accessibility tree: the recipe must delay its paint, not its exposure.
  const windowSnapshot = await page.getByTestId("delay").ariaSnapshot();

  await info.attach("delay-window-accessibility", {
    body: windowSnapshot,
    contentType: "text/plain",
  });
  expect(windowSnapshot).toBe("- text: DL");

  // The failure, still inside that window: the Fallback shows at once.
  await page.getByTestId("delay-broken").click();
  await expect(page.getByTestId("delay")).toHaveAttribute("data-status", "error");
  expect(
    await page
      .getByTestId("delay-fallback")
      .evaluate((fallback) => getComputedStyle(fallback).opacity),
  ).toBe("1");
});
