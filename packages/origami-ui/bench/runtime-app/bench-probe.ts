// The perf app's window hooks, the only things the runner reads or calls besides the public DOM:
// the bootstrap and mount start times, the classes it counts on the heap, the readiness results and
// the open predicate. Nothing here reads Origami's classes, private state or hooks.
import type { Readiness } from "./readiness";

declare global {
  interface Window {
    // The classes whose live instances the runner counts with Runtime.queryObjects.
    __benchTypes?: { checkbox: object };
    // Set once the app bootstrapped and was stable for the first time.
    __benchReady?: boolean;
    // A hydrate page's readiness and interactivity results.
    __benchHydration?: Readiness;
    // A mount page's results for its latest mount.
    __benchMount?: Readiness;
    // A mount page's heap cycle: mounts or destroys the list, then waits for the app to be stable.
    __benchCycle?: (mount: boolean) => Promise<void>;
    // An open page's predicate state and its openings.
    __benchOpen?: OpenProbe;
  }
}

let ssrButtons: HTMLButtonElement[] = [];
let mountStart = 0;

// Keeps the server-rendered list's buttons before bootstrap, so hydration can be checked to keep
// every one of them.
export function rememberSsrButtons(): void {
  ssrButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("#items button"));
}

export function ssrButtonsAtLoad(): readonly HTMLButtonElement[] {
  return ssrButtons;
}

export function bootstrapStart(): number {
  return performance.getEntriesByName("bench:bootstrap")[0].startTime;
}

// The mount handler's start, taken immediately before it renders the list.
export function markMountStart(): void {
  mountStart = performance.now();
}

export function mountStartTime(): number {
  return mountStart;
}

// Each open scenario's content is placed this far below its anchor.
const gap = 8;

export interface OpenTarget {
  trigger: HTMLElement;
  content: HTMLElement;
  // The input that opens it: a click, or focus for Tooltip.
  input: "click" | "focusin";
  // The items the content renders while open, when it has any.
  items?: { selector: string; count: number };
}

// The content's placement before an opening: the previous opening's, when there was one.
export interface Placement {
  side: string | null;
  top: string;
  left: string;
}

// Everything the predicate reads.
export interface OpenState extends Placement {
  nativeOpen: boolean;
  inert: boolean;
  opacity: string;
  pointerEvents: string;
  visibility: string;
  display: string;
  width: number;
  height: number;
  topError: number;
  leftError: number;
  items: number;
}

export interface Opening {
  ms: number;
  before: Placement;
  end: OpenState;
}

export interface OpenProbe {
  openings: Opening[];
  // What a stuck opening looked like, for the runner's failure snapshot.
  diagnose(): {
    armed: boolean;
    state: OpenState;
    html: string;
    contentRect: Record<string, number>;
    anchorRect: Record<string, number>;
  };
}

// Times every opening from its input to the content being revealed and placed at the anchor's
// current position. Each input arms a new opening; the first mutation after which every condition
// holds ends it.
export function installOpenProbe({ trigger, content, input, items }: OpenTarget): void {
  const openings: Opening[] = [];
  let armed: { start: number; before: Placement } | null = null;

  function placement(): Placement {
    return {
      side: content.getAttribute("data-side"),
      top: content.style.top,
      left: content.style.left,
    };
  }

  function read(): OpenState {
    const rect = content.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const style = getComputedStyle(content);
    let count = 0;

    if (items) {
      count = content.querySelectorAll(items.selector).length;
    }

    return {
      ...placement(),
      nativeOpen: content.matches(":popover-open"),
      inert: content.inert,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      visibility: style.visibility,
      display: style.display,
      width: rect.width,
      height: rect.height,
      topError: rect.top - (anchor.bottom + gap),
      leftError: rect.left - anchor.left,
      items: count,
    };
  }

  // Floating's preparation shows the content transparent and unclickable at the previous
  // coordinates, so the reveal state is what tells a placed opening from a prepared one.
  function revealedAndPlaced(state: OpenState): boolean {
    const shown = state.nativeOpen && !state.inert;
    const revealed =
      state.opacity === "1" &&
      state.pointerEvents === "auto" &&
      state.visibility === "visible" &&
      state.display !== "none";
    const placed =
      state.side === "block-end" &&
      state.width > 0 &&
      state.height > 0 &&
      Math.abs(state.topError) <= 1 &&
      Math.abs(state.leftError) <= 1;
    const complete = items === undefined || state.items === items.count;

    return shown && revealed && placed && complete;
  }

  document.addEventListener(
    input,
    (event) => {
      if (event.target !== trigger) {
        return;
      }

      armed = { start: performance.now(), before: placement() };
    },
    true,
  );

  const observer = new MutationObserver(() => {
    if (armed === null) {
      return;
    }

    const state = read();

    if (!revealedAndPlaced(state)) {
      return;
    }

    const end = performance.now();

    openings.push({ ms: end - armed.start, before: armed.before, end: state });
    armed = null;
  });

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-side", "style"],
  });

  window.__benchOpen = {
    openings,
    diagnose: () => {
      return {
        armed: armed !== null,
        state: read(),
        html: content.outerHTML,
        contentRect: content.getBoundingClientRect().toJSON(),
        anchorRect: trigger.getBoundingClientRect().toJSON(),
      };
    },
  };
}
