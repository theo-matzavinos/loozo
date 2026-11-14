// Page-side evidence for the falsifier (plan §13, P1c's checks as the suite's copies). Installed
// with main.js held, so it sees every server-rendered slot element and every attribute change
// from the first line of application code. Serialized by page.evaluate: it must stay
// self-contained.

export type Stamp = { time: number; sequence: number };

export type Mutation = Stamp & {
  instance: string;
  phase: "pre" | "init" | "after";
  slot: string;
  id: string | null;
  name: string;
  /** The server value; a missing server attribute is `null`, so additions count. */
  server: string | null;
  old: string | null;
  value: string | null;
  angularOwned: boolean;
  changesServerValue: boolean;
};

export type Window = {
  id: string | null;
  start: Stamp | null;
  ready: Stamp | null;
  end: (Stamp & { reason: string }) | null;
};

export type Bound = Stamp & { instance: string; slot: string; phase: string };

export type Reach = Stamp & { instance: string; type: string; bounds: number; stack: string };

export type Early = Stamp & {
  instance: string;
  bounds: number;
  ready: boolean;
  defaultPrevented: boolean;
  expanded: string | null;
};

export type Evidence = {
  initial: {
    instance: string;
    slot: string;
    id: string | null;
    attributes: Record<string, string>;
  }[];
  instances: Record<string, Window>;
  mutations: Mutation[];
  bounds: Bound[];
  reaches: Reach[];
  early: Early[];
  dispatched: Early[];
  earlyPrevented: boolean | null;
  /** Reads of the early event's `defaultPrevented` from outside the suite: see `early` below. */
  earlyDelivery: { defaultPreventedReads: number };
  firstTrustedInput: (Stamp & { type: string; instance: string | null }) | null;
};

/** What the fixture's probes (src/probe.ts) and the specs call. */
export type Probe = {
  start(instance: string): void;
  ready(instance: string): void;
  reach(instance: string, type: string): void;
  early(instance: string, event: KeyboardEvent): void;
  dispatched(instance: string, event: KeyboardEvent): void;
  /** Ends a window with no input of its own, like the order Select's, once its hydration settled. */
  settle(instance: string): void;
};

declare global {
  interface Window {
    __uiSdkEvidence: Evidence;
    __uiSdkFlush: () => void;
    __uiSdkEarlyEvent?: KeyboardEvent;
    __uiSdkProbe?: Probe;
    /** The server-rendered slot elements, to check hydration kept them. */
    __uiSdkServerNodes: Element[];
  }
}

export function observeSlots(): void {
  Error.stackTraceLimit = 100;

  const nodes = [...document.querySelectorAll("[data-slot]")];
  const initial = new Map<Element, Record<string, string>>();
  const owners = new Map<Element, string>();

  for (const node of nodes) {
    const attributes: Record<string, string> = {};

    for (const attribute of node.attributes) {
      attributes[attribute.name] = attribute.value;
    }

    initial.set(node, attributes);
    owners.set(node, node.closest("[data-ui-sdk-id]")?.getAttribute("data-testid") ?? "unknown");
  }

  const evidence: Evidence = {
    initial: [],
    instances: {},
    mutations: [],
    bounds: [],
    reaches: [],
    early: [],
    dispatched: [],
    earlyPrevented: null,
    earlyDelivery: { defaultPreventedReads: 0 },
    firstTrustedInput: null,
  };

  window.__uiSdkEvidence = evidence;
  window.__uiSdkServerNodes = nodes;

  for (const node of nodes) {
    const attributes = initial.get(node)!;
    const instance = owners.get(node)!;

    evidence.initial.push({
      instance,
      slot: attributes["data-slot"]!,
      id: attributes["id"] ?? null,
      attributes,
    });

    if (!evidence.instances[instance]) {
      const root = node.closest("[data-ui-sdk-id]");

      evidence.instances[instance] = {
        id: root?.getAttribute("data-ui-sdk-id") ?? null,
        start: null,
        ready: null,
        end: null,
      };
    }
  }

  let sequence = 0;
  const stamp = (): Stamp => {
    sequence += 1;

    return { time: performance.now(), sequence };
  };
  const phase = (instance: string) => {
    const window = evidence.instances[instance]!;

    if (!window.start) {
      return "pre";
    }

    if (!window.end) {
      return "init";
    }

    return "after";
  };
  const angularOwned = new Set(["jsaction", "ngb", "ngh", "ngskiphydration"]);

  const record = (records: MutationRecord[]) => {
    for (let index = 0; index < records.length; index++) {
      const mutation = records[index]!;
      const target = mutation.target as Element;
      const server = initial.get(target);

      if (!server) {
        continue;
      }

      const name = mutation.attributeName!;
      // The value this record left is the next same-name record's old value, or the current one.
      let value = target.getAttribute(name);

      for (let later = index + 1; later < records.length; later++) {
        const other = records[later]!;

        if (other.target === target && other.attributeName === name) {
          value = other.oldValue;
          break;
        }
      }

      const instance = owners.get(target)!;
      let serverValue: string | null = null;

      if (Object.hasOwn(server, name)) {
        serverValue = server[name]!;
      }

      evidence.mutations.push({
        ...stamp(),
        instance,
        phase: phase(instance),
        slot: server["data-slot"]!,
        id: server["id"] ?? null,
        name,
        server: serverValue,
        old: mutation.oldValue,
        value,
        angularOwned: angularOwned.has(name),
        changesServerValue: value !== serverValue,
      });
    }
  };

  const observer = new MutationObserver(record);

  for (const node of nodes) {
    observer.observe(node, { attributes: true, attributeOldValue: true });
  }

  const flush = () => record(observer.takeRecords());

  window.__uiSdkFlush = flush;

  const boundCount = (instance: string) => {
    let count = 0;

    for (const bound of evidence.bounds) {
      if (bound.instance === instance) {
        count += 1;
      }
    }

    return count;
  };

  // Core's bind follows the element's id with its own MutationObserver (`followId`); that call
  // marks a slot element's first bind without any hook in the package.
  const bound = new Set<Element>();
  const observe = Object.getOwnPropertyDescriptor(MutationObserver.prototype, "observe")!
    .value as MutationObserver["observe"];

  MutationObserver.prototype.observe = function (target: Node, options?: MutationObserverInit) {
    const element = target as Element;
    const filter = options?.attributeFilter;

    if (initial.has(element) && !bound.has(element) && filter?.length === 1 && filter[0] === "id") {
      flush();
      bound.add(element);

      const instance = owners.get(element)!;

      evidence.bounds.push({
        ...stamp(),
        instance,
        slot: initial.get(element)!["data-slot"]!,
        phase: phase(instance),
      });
    }

    return observe.call(this, target, options);
  };

  const trigger = (instance: string) => {
    for (const [node, owner] of owners) {
      if (owner === instance && initial.get(node)!["data-slot"] === "select-trigger") {
        return node;
      }
    }

    return undefined;
  };

  window.__uiSdkProbe = {
    start(instance: string) {
      flush();

      const window = evidence.instances[instance];

      if (window && !window.start) {
        window.start = stamp();
      }
    },
    ready(instance: string) {
      flush();

      const window = evidence.instances[instance];

      if (window && !window.ready) {
        window.ready = stamp();
      }
    },
    reach(instance: string, type: string) {
      flush();

      const reach = {
        ...stamp(),
        instance,
        type,
        bounds: boundCount(instance),
        stack: String(new Error("reach").stack),
      };
      const window = evidence.instances[instance];

      evidence.reaches.push(reach);

      if (window?.start && !window.end) {
        window.end = { ...reach, reason: `reach:${type}` };
      }
    },
    early(instance: string, event: KeyboardEvent) {
      flush();
      // Counts reads of the event's `defaultPrevented`, passing the real flag through. Core's
      // handler wrapper reads it on entry to every call, also on a call it then skips because the
      // event is prevented, so a second forward adds a read even where it changes nothing else
      // (Q4). The suite's own reads go to Event.prototype and aren't counted.
      const delivery = evidence.earlyDelivery;

      Object.defineProperty(event, "defaultPrevented", {
        get: () => {
          delivery.defaultPreventedReads += 1;

          return Reflect.get(Event.prototype, "defaultPrevented", event) as boolean;
        },
      });
      window.__uiSdkEarlyEvent = event;
      evidence.early.push({
        ...stamp(),
        instance,
        bounds: boundCount(instance),
        ready: !!evidence.instances[instance]?.ready,
        defaultPrevented: Reflect.get(Event.prototype, "defaultPrevented", event),
        expanded: trigger(instance)?.getAttribute("aria-expanded") ?? null,
      });
    },
    settle(instance: string) {
      flush();

      const window = evidence.instances[instance];

      if (window?.start && !window.end) {
        window.end = { ...stamp(), reason: "settled" };
      }
    },
    dispatched(instance: string, event: KeyboardEvent) {
      flush();
      evidence.dispatched.push({
        ...stamp(),
        instance,
        bounds: boundCount(instance),
        ready: !!evidence.instances[instance]?.ready,
        defaultPrevented: Reflect.get(Event.prototype, "defaultPrevented", event),
        expanded: trigger(instance)?.getAttribute("aria-expanded") ?? null,
      });
    },
  };

  // A trusted input on a started instance's element ends its window before any listener runs.
  for (const type of ["pointerdown", "mousedown", "keydown", "click", "focusin", "pointermove"]) {
    document.addEventListener(
      type,
      (event) => {
        if (!event.isTrusted) {
          return;
        }

        flush();

        let instance: string | null = null;

        for (const [node, owner] of owners) {
          if (node === event.target) {
            instance = owner;
          }
        }

        const entry = { ...stamp(), type, instance };

        evidence.firstTrustedInput ??= entry;

        if (instance === null) {
          return;
        }

        const window = evidence.instances[instance];

        if (window?.start && !window.end) {
          window.end = { ...entry, reason: `trusted:${type}` };
        }
      },
      { capture: true },
    );
  }
}
