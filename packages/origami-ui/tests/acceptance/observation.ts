import { expect } from "playwright/test";
import type { Page, TestInfo } from "playwright/test";

interface SavedNode {
  key: string;
  testid: string | null;
  unit: Element | null;
  unitLabel: string | null;
  settledPresent: boolean;
  node: Element;
  parent: Node | null;
  id: string;
  controls: string | null;
  labelledBy: string | null;
  generated: string | null;
  values: string | null;
}
interface Discovery {
  testid: string | null;
  entering: boolean;
  leaving: boolean;
  present: boolean;
  hidden: boolean;
  inert: boolean;
  children: number;
  native: boolean;
  opacity: string;
  left: string;
  top: string;
  stack: string | undefined;
}
interface Paint {
  opacity: number;
  native: boolean;
  inert: boolean;
  left: string;
  top: string;
  x: number;
  y: number;
  width: number;
  height: number;
  anchor?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
  writingMode?: string;
  direction?: string;
  viewport: { width: number; height: number };
}
interface BrowserObservation {
  saved: SavedNode[];
  removed: string[];
  duplicateIds: string[];
  duplicateLabels: string[];
  entered: string[];
  flushRetention: () => void;
  stopRetention: () => void;
  watching: boolean;
  registrations: { type: string; target: string }[];
  discoveries: Discovery[];
  paints: Paint[];
  trust: { type: string; trusted: boolean; pointerId?: number; button?: number }[];
  focus: (string | null)[];
  geometry: { testid: string | null; connected: boolean; stack: string | undefined }[];
  observers: { kind: string; targets: Element[]; stack: string | undefined }[];
  frames: number;
}
declare global {
  interface Window {
    acceptanceObservation: BrowserObservation;
  }
}

/** Passive DOM retention observation and forwarding native call probes, never substitute behavior. */
export async function installObservation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const observation: BrowserObservation = {
      saved: [],
      removed: [],
      duplicateIds: [],
      duplicateLabels: [],
      entered: [],
      flushRetention: () => {},
      stopRetention: () => {},
      watching: false,
      registrations: [],
      discoveries: [],
      paints: [],
      trust: [],
      focus: [],
      geometry: [],
      observers: [],
      frames: 0,
    };

    window.acceptanceObservation = observation;

    const add = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function (...args: Parameters<typeof add>) {
      const [type] = args;

      if (type === "click" || type === "keydown") {
        let target = "other";

        if (this === document) {
          target = "document";
        }

        if (this === document.body) {
          target = "body";
        }

        observation.registrations.push({ type, target });
      }

      return add.apply(this, args);
    };
    add.call(
      document,
      "focusin",
      (event: Event) => {
        if (event.target instanceof Element) {
          observation.focus.push(event.target.getAttribute("data-testid"));
        }
      },
      true,
    );

    const getRectangle = Element.prototype.getBoundingClientRect;

    Element.prototype.getBoundingClientRect = function (...args: Parameters<typeof getRectangle>) {
      const testid = this.getAttribute("data-testid");

      if (testid) {
        observation.geometry.push({
          testid,
          connected: this.isConnected,
          stack: new Error().stack,
        });
      }

      return getRectangle.apply(this, args);
    };

    const observers = new WeakMap<
      object,
      { kind: string; targets: Element[]; stack: string | undefined }
    >();

    for (const [kind, prototype] of [
      ["resize", ResizeObserver.prototype],
      ["intersection", IntersectionObserver.prototype],
    ] as const) {
      const observe = prototype.observe;
      const unobserve = prototype.unobserve;
      const disconnect = prototype.disconnect;

      prototype.observe = function (...args: Parameters<typeof observe>) {
        const result = Reflect.apply(observe, this, args);
        let record = observers.get(this);

        if (!record) {
          record = { kind, targets: [], stack: new Error().stack };
          observers.set(this, record);
          observation.observers.push(record);
        }

        if (!record.targets.includes(args[0])) {
          record.targets.push(args[0]);
        }

        return result;
      };
      prototype.unobserve = function (...args: Parameters<typeof unobserve>) {
        const result = Reflect.apply(unobserve, this, args);
        const record = observers.get(this);

        if (record) {
          record.targets = record.targets.filter((target) => target !== args[0]);
        }

        return result;
      };
      prototype.disconnect = function (...args: Parameters<typeof disconnect>) {
        const result = Reflect.apply(disconnect, this, args);
        const record = observers.get(this);

        if (record) {
          record.targets = [];
        }

        return result;
      };
    }

    const getAnimations = Element.prototype.getAnimations;

    Element.prototype.getAnimations = function (...args: Parameters<typeof getAnimations>) {
      if (this instanceof HTMLElement) {
        const style = getComputedStyle(this);

        observation.discoveries.push({
          testid: this.getAttribute("data-testid"),
          entering: this.hasAttribute("data-entering"),
          leaving: this.hasAttribute("data-leaving"),
          present: this.hasAttribute("data-present"),
          hidden: this.hasAttribute("hidden"),
          inert: this.inert,
          children: this.children.length,
          native: this.matches(":popover-open"),
          opacity: style.opacity,
          left: this.style.left,
          top: this.style.top,
          stack: new Error().stack,
        });
      }

      return getAnimations.apply(this, args);
    };

    for (const type of [
      "pointerdown",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
      "beforematch",
      "dragstart",
      "dragend",
    ]) {
      add.call(
        document,
        type,
        (event: Event) => {
          if (event instanceof PointerEvent) {
            observation.trust.push({
              type,
              trusted: event.isTrusted,
              pointerId: event.pointerId,
              button: event.button,
            });
          } else {
            observation.trust.push({ type, trusted: event.isTrusted });
          }
        },
        true,
      );
    }

    function frame(): void {
      observation.frames += 1;

      const content = document.querySelector('[data-testid="native-content"]');

      if (content instanceof HTMLElement && content.matches(":popover-open")) {
        const rectangle = content.getBoundingClientRect();
        const anchorElement =
          document.querySelector('[data-testid="native-anchor"]') ??
          document.querySelector('[data-testid="native-trigger"]');
        let anchor: Paint["anchor"];
        let writingMode: string | undefined;
        let direction: string | undefined;

        if (anchorElement instanceof HTMLElement) {
          const box = anchorElement.getBoundingClientRect();

          anchor = {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };

          const style = getComputedStyle(anchorElement);

          writingMode = style.writingMode;
          direction = style.direction;
        }

        observation.paints.push({
          opacity: Number(getComputedStyle(content).opacity),
          native: true,
          inert: content.inert,
          left: content.style.left,
          top: content.style.top,
          x: rectangle.x,
          y: rectangle.y,
          width: rectangle.width,
          height: rectangle.height,
          anchor,
          writingMode,
          direction,
          viewport: {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          },
        });
      }

      requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
  });
}

/** Runs entirely in the browser. Native records are replayed in a read-only graph, never in the DOM. */
export function captureDomRetention(): void {
  const observation = window.acceptanceObservation;

  observation.stopRetention();

  const occurrences = new Map<string, number>();
  const labels = new Map<Element | null, Map<string, { maximum: number; key: string }>>();
  const originalUnits = new Set<Element>();
  const originals = new Map<Node, SavedNode>();

  observation.saved = [];
  observation.removed = [];
  observation.duplicateIds = [];
  observation.duplicateLabels = [];
  observation.entered = [];

  for (const node of document.querySelectorAll("[data-testid], [data-unit]")) {
    const unit = node.closest("[data-unit]");
    const testid = node.getAttribute("data-testid");
    const prefix = `${unit?.getAttribute("data-unit") ?? "page"}:${testid ?? "unit-host"}`;
    const occurrence = occurrences.get(prefix) ?? 0;
    const key = `${prefix}:${occurrence}`;

    occurrences.set(prefix, occurrence + 1);

    if (unit) {
      originalUnits.add(unit);
    }

    if (testid !== null) {
      let unitLabels = labels.get(unit);

      if (!unitLabels) {
        unitLabels = new Map();
        labels.set(unit, unitLabels);
      }

      const group = unitLabels.get(testid) ?? { maximum: 0, key };

      group.maximum += 1;
      unitLabels.set(testid, group);
    }

    if (node.hasAttribute("data-entering")) {
      observation.entered.push(key);
    }

    observation.saved.push({
      key,
      testid,
      unit,
      unitLabel: node.getAttribute("data-unit"),
      settledPresent: node.hasAttribute("data-present"),
      node,
      parent: node.parentNode,
      id: node.id,
      controls: node.getAttribute("aria-controls"),
      labelledBy: node.getAttribute("aria-labelledby"),
      generated: node.getAttribute("data-generated-id"),
      values: node.getAttribute("data-item-values"),
    });
  }

  for (const saved of observation.saved) {
    originals.set(saved.node, saved);
  }

  const attributes = ["id", "data-testid", "data-unit", "data-entering"];

  function consume(records: MutationRecord[]): void {
    if (!observation.watching) {
      return;
    }

    const graph = new Map<Node, { parent: Node | null; attributes: Map<string, string | null> }>();

    function collect(node: Node): void {
      if (graph.has(node)) {
        return;
      }

      const values = new Map<string, string | null>();

      if (node instanceof Element) {
        for (const name of attributes) {
          values.set(name, node.getAttribute(name));
        }
      }

      graph.set(node, { parent: node.parentNode, attributes: values });

      for (const child of node.childNodes) {
        collect(child);
      }

      if (node.parentNode) {
        collect(node.parentNode);
      }
    }

    collect(document);

    for (const saved of observation.saved) {
      collect(saved.node);
    }

    for (const record of records) {
      collect(record.target);

      for (const node of [...record.addedNodes, ...record.removedNodes]) {
        collect(node);
      }
    }

    // Restore the graph to the start of this delivery. Record.target preserves the
    // insertion/removal owner even when the candidate/wrapper is now detached.
    const attributeAfter = new Map<MutationRecord, string | null>();

    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index]!;

      if (record.type === "attributes" && record.attributeName) {
        const values = graph.get(record.target)!.attributes;

        attributeAfter.set(record, values.get(record.attributeName) ?? null);
        values.set(record.attributeName, record.oldValue);
      }

      if (record.type === "childList") {
        for (const node of record.addedNodes) {
          graph.get(node)!.parent = null;
        }

        for (const node of record.removedNodes) {
          graph.get(node)!.parent = record.target;
        }
      }
    }

    function contains(ancestor: Node, candidate: Node): boolean {
      let current: Node | null = candidate;

      while (current) {
        if (current === ancestor) {
          return true;
        }

        current = graph.get(current)!.parent;
      }

      return false;
    }

    function owner(candidate: Node): Element | null {
      let current: Node | null = candidate;

      while (current) {
        if (
          current instanceof Element &&
          (originalUnits.has(current) || graph.get(current)!.attributes.get("data-unit") !== null)
        ) {
          return current;
        }

        current = graph.get(current)!.parent;
      }

      return null;
    }

    function scan(): void {
      const ids = new Map<string, number>();
      const counts = new Map<Element | null, Map<string, number>>();

      for (const [node, state] of graph) {
        if (!(node instanceof Element) || !contains(document, node)) {
          continue;
        }

        const id = state.attributes.get("id");

        if (id) {
          ids.set(id, (ids.get(id) ?? 0) + 1);
        }

        let testid = state.attributes.get("data-testid");
        let unit = owner(node);
        const original = originals.get(node);

        if (original && original.testid !== null) {
          testid = original.testid;
          unit = original.unit;
        }

        if (testid !== null && testid !== undefined) {
          let unitCounts = counts.get(unit);

          if (!unitCounts) {
            unitCounts = new Map();
            counts.set(unit, unitCounts);
          }

          unitCounts.set(testid, (unitCounts.get(testid) ?? 0) + 1);
        }
      }

      for (const saved of observation.saved) {
        if (
          saved.id &&
          (ids.get(saved.id) ?? 0) > 1 &&
          !observation.duplicateIds.includes(saved.id)
        ) {
          observation.duplicateIds.push(saved.id);
        }

        if (
          saved.settledPresent &&
          graph.get(saved.node)!.attributes.get("data-entering") !== null &&
          !observation.entered.includes(saved.key)
        ) {
          observation.entered.push(saved.key);
        }
      }

      for (const [unit, groups] of labels) {
        for (const [testid, group] of groups) {
          if (
            (counts.get(unit)?.get(testid) ?? 0) > group.maximum &&
            !observation.duplicateLabels.includes(group.key)
          ) {
            observation.duplicateLabels.push(group.key);
          }
        }
      }
    }

    scan();

    for (const record of records) {
      if (record.type === "childList") {
        for (const removed of record.removedNodes) {
          for (const saved of observation.saved) {
            if (contains(removed, saved.node) && !observation.removed.includes(saved.key)) {
              observation.removed.push(saved.key);
            }
          }

          graph.get(removed)!.parent = null;
        }

        for (const added of record.addedNodes) {
          graph.get(added)!.parent = record.target;
        }
      }

      if (record.type === "attributes" && record.attributeName) {
        graph
          .get(record.target)!
          .attributes.set(record.attributeName, attributeAfter.get(record) ?? null);
      }

      scan();
    }
  }

  const observer = new MutationObserver(consume);

  observation.watching = true;
  consume([]);
  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: attributes,
    attributeOldValue: true,
  });
  observation.flushRetention = () => consume(observer.takeRecords());
  observation.stopRetention = () => {
    observation.flushRetention();
    observation.watching = false;
    observer.disconnect();
  };
}

export async function captureReferences(page: Page): Promise<void> {
  await page.evaluate(captureDomRetention);
}

/** `removed`: saved keys a case intentionally removes; every other reference must be retained. */
export async function assertReferences(
  page: Page,
  testInfo: TestInfo,
  { removed = [] }: { removed?: string[] } = {},
): Promise<void> {
  const result = await page.evaluate(() => {
    const observation = window.acceptanceObservation;

    observation.flushRetention();

    const changed = [];

    for (const saved of observation.saved) {
      const node = saved.node;

      if (
        !node.isConnected ||
        node.parentNode !== saved.parent ||
        node.id !== saved.id ||
        node.getAttribute("data-testid") !== saved.testid ||
        node.getAttribute("data-unit") !== saved.unitLabel ||
        node.getAttribute("aria-controls") !== saved.controls ||
        node.getAttribute("aria-labelledby") !== saved.labelledBy ||
        node.getAttribute("data-generated-id") !== saved.generated ||
        node.getAttribute("data-item-values") !== saved.values
      ) {
        changed.push(saved.key);
      }
    }

    return {
      changed,
      removed: observation.removed,
      duplicateIds: observation.duplicateIds,
      duplicateLabels: observation.duplicateLabels,
      entered: observation.entered,
    };
  });

  await testInfo.attach("prebootstrap-node-retention", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
  expect({ ...result, changed: result.changed.sort(), removed: result.removed.sort() }).toEqual({
    changed: [...removed].sort(),
    removed: [...removed].sort(),
    duplicateIds: [],
    duplicateLabels: [],
    entered: [],
  });
}

export async function stopRetentionObservation(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.acceptanceObservation.stopRetention();
  });
}

export async function bootstrapHeld(
  page: Page,
  url: string,
  testInfo: TestInfo,
): Promise<() => void> {
  await installObservation(page);

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let mainHeld = false;

  await page.route("**/*", async (route) => {
    const pathname = new URL(route.request().url()).pathname;

    if (!/\/main(?:-[\w-]+)?\.(?:m?js|ts)$/.test(pathname)) {
      await route.fallback();

      return;
    }

    mainHeld = true;
    await gate;
    await route.continue();
  });

  const response = await page.goto(url, { waitUntil: "commit" });

  expect(response?.status()).toBe(200);

  const raw = await response?.text();

  expect(raw).toBeDefined();
  expect(raw).toContain("ngh=");
  await testInfo.attach("raw-genuine-ssr.html", { body: raw ?? "", contentType: "text/html" });
  await expect.poll(() => mainHeld).toBe(true);
  await page.waitForFunction(
    () => document.readyState !== "loading" && document.querySelector("[data-testid], [data-unit]"),
  );
  await captureReferences(page);

  return release;
}

export async function fixture(page: Page, name: string, testInfo: TestInfo): Promise<void> {
  const release = await bootstrapHeld(page, `/${name}`, testInfo);

  release();
  await expect(page.locator("setup-readiness")).toHaveAttribute("data-shell-attached", "true");
  await expect(page.locator("setup-readiness")).toHaveAttribute(
    "data-runtime",
    String(testInfo.project.metadata.runtime),
  );
  await page.getByTestId("attach-fixture").click();
  await expect(page.getByTestId("fixture-attached")).toHaveText("true");
  await assertReferences(page, testInfo);
  await stopRetentionObservation(page);
}

export async function attachObservation(page: Page, testInfo: TestInfo): Promise<void> {
  const result = await page.evaluate(() => {
    const observation = window.acceptanceObservation;

    return {
      registrations: observation.registrations,
      discoveries: observation.discoveries,
      paints: observation.paints,
      trust: observation.trust,
      focus: observation.focus,
      geometry: observation.geometry,
      observers: observation.observers.map((record) => ({
        kind: record.kind,
        stack: record.stack,
        targets: record.targets.map((target) => target.getAttribute("data-testid")),
      })),
      frames: observation.frames,
    };
  });

  await testInfo.attach("native-and-render-observations", {
    body: JSON.stringify(result, null, 2),
    contentType: "application/json",
  });
}
