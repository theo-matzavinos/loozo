// The hydrate and mount pages' readiness probe and their interactivity check. The probe runs in the
// list's first afterNextRender and ends the timed span only once its snapshot holds; the
// interactivity check runs after the end, outside the span. It reads public APIs only: the list's
// child queries, its models and the DOM.
import { ApplicationRef, Injector, type Signal, afterNextRender, inject } from "@angular/core";
import { bootstrapStart, mountStartTime, ssrButtonsAtLoad } from "./bench-probe";

export const listSize = 1000;

// The first and last controls, the ones the interactivity check clicks.
const clicked = [0, listSize - 1];

// How the probe treats a list's first render: hydrating the server-rendered list (the routes'
// default), a timed client mount, or a heap cycle's mount, which only snapshots.
export type ReadinessMode = "hydrate" | "mount" | "heap";

// What a list gives the probe: the count of initialized controls from its public child query, every
// control's model, and the fixture's own change counter per control.
export interface Controls {
  initialized(): number;
  models(): readonly boolean[];
  changes: readonly number[];
}

export interface Snapshot {
  count: number;
  ssrCount: number;
  initialized: number;
  allModelsFalse: boolean;
  connected: boolean;
  identity: boolean;
}

export interface Dispatch {
  index: number;
  before: boolean;
  after: boolean;
  changesBefore: number;
  changesAfter: number;
  // Recorded only: a zoneless click doesn't update the DOM within its dispatch.
  ariaChecked: string | null;
}

export interface Rendered {
  index: number;
  model: boolean;
  changes: number;
  ariaChecked: string | null;
  dataChecked: boolean;
  retained: boolean;
}

export interface Settled {
  index: number;
  model: boolean;
  changes: number;
}

export interface Readiness {
  mode: ReadinessMode;
  snapshot: Snapshot;
  passed: boolean;
  // The timed span; null when the snapshot failed, and for a heap cycle.
  ms: number | null;
  dispatched: Dispatch[];
  rendered: Rendered[];
  settled: Settled[];
  // Set once every check that applies to the mode has run.
  done: boolean;
}

function snapshotOf(buttons: HTMLButtonElement[], controls: Controls): Snapshot {
  const ssr = ssrButtonsAtLoad();
  const models = controls.models();
  let allModelsFalse = models.length === listSize;
  let connected = true;
  let identity = buttons.length === listSize;

  for (const model of models) {
    if (model !== false) {
      allModelsFalse = false;
    }
  }

  for (let index = 0; index < buttons.length; index++) {
    if (!buttons[index].isConnected) {
      connected = false;
    }

    if (buttons[index] !== ssr[index]) {
      identity = false;
    }
  }

  return {
    count: buttons.length,
    ssrCount: ssr.length,
    initialized: controls.initialized(),
    allModelsFalse,
    connected,
    identity,
  };
}

function passes(mode: ReadinessMode, snapshot: Snapshot): boolean {
  const ready =
    snapshot.count === listSize &&
    snapshot.initialized === listSize &&
    snapshot.allModelsFalse &&
    snapshot.connected;

  // Hydration keeps every server-rendered button; a mount starts from a server render without any.
  if (mode === "hydrate") {
    return ready && snapshot.ssrCount === listSize && snapshot.identity;
  }

  return ready && snapshot.ssrCount === 0;
}

function publish(readiness: Readiness): void {
  if (readiness.mode === "hydrate") {
    window.__benchHydration = readiness;

    return;
  }

  window.__benchMount = readiness;
}

// Clicks the first and last controls: each model and counter must change during the dispatch, the
// following render must show it, and both must hold once the app is stable.
async function checkInteractivity(
  readiness: Readiness,
  buttons: HTMLButtonElement[],
  controls: Controls,
  injector: Injector,
): Promise<void> {
  const ssr = ssrButtonsAtLoad();
  let rendered!: () => void;
  const renderedOnce = new Promise<void>((resolve) => {
    rendered = resolve;
  });

  // Registered before the dispatch, so it runs after the render the clicks schedule.
  afterNextRender(
    () => {
      const current = document.querySelectorAll<HTMLButtonElement>("#items button");
      const models = controls.models();

      for (const index of clicked) {
        const button = buttons[index];
        let retained = button.isConnected && current[index] === button;

        if (readiness.mode === "hydrate") {
          retained = retained && button === ssr[index];
        }

        readiness.rendered.push({
          index,
          model: models[index],
          changes: controls.changes[index],
          ariaChecked: button.getAttribute("aria-checked"),
          dataChecked: button.hasAttribute("data-checked"),
          retained,
        });
      }

      rendered();
    },
    { injector },
  );

  for (const index of clicked) {
    const before = controls.models()[index];
    const changesBefore = controls.changes[index];

    buttons[index].click();
    readiness.dispatched.push({
      index,
      before,
      after: controls.models()[index],
      changesBefore,
      changesAfter: controls.changes[index],
      ariaChecked: buttons[index].getAttribute("aria-checked"),
    });
  }

  await renderedOnce;
  await injector.get(ApplicationRef).whenStable();

  const models = controls.models();

  for (const index of clicked) {
    readiness.settled.push({ index, model: models[index], changes: controls.changes[index] });
  }
}

// Called from a list's constructor. In the list's first render it snapshots the list, timestamps the
// end only when the snapshot holds, then runs the interactivity check outside the span (not for a
// heap cycle). The results go to window.__benchHydration or window.__benchMount.
export function installReadiness(mode: Signal<ReadinessMode>, controls: Controls): void {
  const injector = inject(Injector);

  afterNextRender(() => {
    const current = mode();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#items button"));
    const snapshot = snapshotOf(buttons, controls);
    const passed = passes(current, snapshot);
    let ms: number | null = null;

    // A heap cycle's mount isn't timed.
    if (passed && current === "hydrate") {
      ms = performance.now() - bootstrapStart();
    } else if (passed && current === "mount") {
      ms = performance.now() - mountStartTime();
    }

    const readiness: Readiness = {
      mode: current,
      snapshot,
      passed,
      ms,
      dispatched: [],
      rendered: [],
      settled: [],
      done: false,
    };

    publish(readiness);

    if (!passed || current === "heap") {
      readiness.done = true;

      return;
    }

    void checkInteractivity(readiness, buttons, controls, injector).then(() => {
      readiness.done = true;
    });
  });
}
