import {
  ApplicationRef,
  Component,
  Directive,
  PLATFORM_ID,
  Service,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { isPlatformServer } from "@angular/common";
import { Router } from "@angular/router";
import { ToastLifetime } from "./toast-lifetime.js";
import {
  OrigamiToast,
  OrigamiToastClose,
  OrigamiToastCloseOptions,
  OrigamiToastOptions,
  OrigamiToastRegion,
  OrigamiToastRegionOptions,
  OrigamiToastRegionState,
  OrigamiToastState,
  OrigamiToaster,
  type OrigamiToastRecord,
} from "@loozo/origami-ui/toast";

/** The fixture's toast data: `motion` picks an exit animation. */
export interface FixtureToast {
  title: string;
  motion?: "exit" | "long" | "reduce-aware";
}

/** The main region's toaster. */
@Service()
export class FixtureToasts extends OrigamiToaster<FixtureToast> {}

/** The factory-replaced region's toaster. */
@Service()
export class OtherToasts extends OrigamiToaster<FixtureToast> {}

/** The existing-replaced region's toaster. */
@Service()
export class ThirdToasts extends OrigamiToaster<FixtureToast> {}

/** A toaster whose region mounts and unmounts under `@if`. */
@Service()
export class LateToasts extends OrigamiToaster<FixtureToast> {}

/** A toaster whose region is in its own hydrate boundary. */
@Service()
export class DeferredToasts extends OrigamiToaster<FixtureToast> {}

/** A record no toaster holds: the exposed inputs that replaced Options must win over. */
const decoy: OrigamiToastRecord<FixtureToast> = { id: "decoy", data: { title: "decoy" } };

/** A descendant of a toast reading its Toast State through DI. */
@Directive({
  selector: "[toastStateProbe]",
  host: { "[attr.data-open]": "state.open()" },
})
export class ToastStateProbe {
  readonly state = inject(OrigamiToastState);
}

/** A descendant of a region reading its Region State through DI. */
@Directive({
  selector: "[regionStateProbe]",
  host: { "[attr.data-count]": "state.toasts().length" },
})
export class RegionStateProbe {
  readonly state = inject(OrigamiToastRegionState);
}

/**
 * A consumer region with factory Options: the other toaster, no expiry and a limit of 1, over
 * its exposed inputs' contradicting values.
 */
@Directive({
  selector: "[appToastRegion]",
  exportAs: "appToastRegion",
  hostDirectives: [
    {
      directive: OrigamiToastRegion,
      inputs: ["ogToastRegion: appToastRegion", "duration", "limit"],
    },
  ],
  providers: [
    OrigamiToastRegionOptions.provideFactory(() => ({
      toaster: signal(inject(OtherToasts)),
      duration: signal(Infinity),
      limit: signal(1),
    })),
  ],
})
export class AppToastRegion {
  readonly state = inject<OrigamiToastRegionState<FixtureToast>>(OrigamiToastRegionState);
}

/** A consumer region whose existing Options are its own record: the third toaster, limit 2. */
@Directive({
  selector: "[existingRegion]",
  exportAs: "existingRegion",
  hostDirectives: [{ directive: OrigamiToastRegion, inputs: ["ogToastRegion: existingRegion"] }],
  providers: [OrigamiToastRegionOptions.provideExisting(() => ExistingRegion)],
})
export class ExistingRegion implements OrigamiToastRegionOptions<FixtureToast> {
  readonly toaster = signal(inject(ThirdToasts));
  readonly duration = signal(Infinity);
  readonly limit = signal(2);
  readonly state = inject<OrigamiToastRegionState<FixtureToast>>(OrigamiToastRegionState);
}

/** A consumer toast whose factory Options take the record from its own `record` input. */
@Directive({
  selector: "[factoryToast]",
  hostDirectives: [{ directive: OrigamiToast, inputs: ["ogToast: factoryToast"] }],
  providers: [
    OrigamiToastOptions.provideFactory(() => {
      const self = inject(FactoryToast);

      return { toast: computed(() => self.record()) };
    }),
  ],
})
export class FactoryToast {
  readonly record = input.required<OrigamiToastRecord<FixtureToast>>();
}

/** A consumer toast whose existing Options are its own `record` input. */
@Directive({
  selector: "[existingToast]",
  hostDirectives: [{ directive: OrigamiToast, inputs: ["ogToast: existingDecoy"] }],
  providers: [OrigamiToastOptions.provideExisting(() => ExistingToast)],
})
export class ExistingToast implements OrigamiToastOptions {
  readonly toast = input.required<OrigamiToastRecord<unknown>>({ alias: "existingToast" });
}

/** A consumer Close whose factory Options keep it disabled and focusable. */
@Directive({
  selector: "button[factoryClose]",
  hostDirectives: [{ directive: OrigamiToastClose, inputs: ["disabled"] }],
  providers: [
    OrigamiToastCloseOptions.provideFactory(() => ({
      disabled: signal(true),
      focusableWhenDisabled: signal(true),
    })),
  ],
})
export class FactoryClose {}

/** A consumer Close whose existing Options keep it enabled over its exposed `disabled`. */
@Directive({
  selector: "button[existingClose]",
  hostDirectives: [{ directive: OrigamiToastClose, inputs: ["disabled"] }],
  providers: [OrigamiToastCloseOptions.provideExisting(() => ExistingClose)],
})
export class ExistingClose implements OrigamiToastCloseOptions {
  readonly disabled = signal(false);
  readonly focusableWhenDisabled = signal(false);
}

/** A caller that adds a toast and is destroyed in the same turn, like a row a refetch removes. */
@Component({
  selector: "toast-caller",
  template: `
    <button type="button" data-testid="caller-add" (click)="raise()">Delete the row</button>
  `,
})
export class ToastCaller {
  readonly #toasts = inject(FixtureToasts);
  readonly added = output();

  raise(): void {
    this.#toasts.add({ title: "Deleted" });
    this.added.emit();
  }
}

@Component({
  selector: "acceptance-toast-fixture",
  imports: [
    OrigamiToastRegion,
    OrigamiToast,
    OrigamiToastClose,
    ToastStateProbe,
    RegionStateProbe,
    AppToastRegion,
    ExistingRegion,
    FactoryToast,
    ExistingToast,
    FactoryClose,
    ExistingClose,
    ToastCaller,
    ToastLifetime,
  ],
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach toast behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <span data-testid="server-add" [attr.data-id]="serverAdd"></span>

    <section>
      <h2>Main</h2>
      <button type="button" data-testid="add" (click)="add()">Add</button>
      <button type="button" data-testid="add-exit" (click)="add({ motion: 'exit' })">
        Add with an exit
      </button>
      <button type="button" data-testid="add-long" (click)="add({ motion: 'long' })">
        Add with a long exit
      </button>
      <button type="button" data-testid="add-reduce" (click)="add({ motion: 'reduce-aware' })">
        Add with a reduced-motion exit
      </button>
      <button type="button" data-testid="add-close" (click)="addAndClose()">
        Add and close in one handler
      </button>
      <button type="button" data-testid="add-four" (click)="addFour()">
        Add four in one handler
      </button>
      <button type="button" data-testid="add-short" (click)="add({}, 1000)">Add 1000 ms</button>
      <button type="button" data-testid="add-medium" (click)="add({}, 1500)">Add 1500 ms</button>
      <button type="button" data-testid="add-infinite" (click)="add({}, Infinity)">
        Add forever
      </button>
      <button type="button" data-testid="close-last" (click)="toasts.close(lastId())">
        Close the last
      </button>
      <button type="button" data-testid="close-unknown" (click)="toasts.close('og-toast-unknown')">
        Close an unknown id
      </button>
      <button type="button" data-testid="bad-duration" (click)="badDuration(0)">
        Add with duration 0
      </button>
      <button type="button" data-testid="huge-duration" (click)="badDuration(2147483648)">
        Add with duration 2147483648
      </button>
      <button type="button" data-testid="add-max" (click)="add({}, 2147483647)">
        Add 2147483647 ms
      </button>
      <button type="button" data-testid="break-limit" (click)="mainLimit.set(0)">
        Set the region's limit to 0
      </button>
      <button type="button" data-testid="break-duration" (click)="mainDuration.set(-1)">
        Set the region's duration to -1
      </button>
      <button type="button" data-testid="huge-region-duration" (click)="mainDuration.set(2147483648)">
        Set the region's duration to 2147483648
      </button>
      <button type="button" data-testid="max-region-duration" (click)="mainDuration.set(2147483647)">
        Set the region's duration to 2147483647
      </button>
      <button type="button" data-testid="fix-config" (click)="fixConfig()">
        Restore the region's duration and limit
      </button>
      <button type="button" data-testid="try-add" (click)="tryAdd()">
        Add, catching a RangeError
      </button>
      <button type="button" data-testid="hide-closes" (click)="closesShown.set(false)">
        Remove the Close buttons
      </button>
      <button type="button" data-testid="hide-list" (click)="listShown.set(false)">
        Remove the toast elements
      </button>
      <button type="button" data-testid="show-all" (click)="showAll()">
        Render the toasts and their Close buttons again
      </button>
      <button type="button" data-testid="navigate" (click)="navigate()">Navigate</button>
      <button type="button" data-testid="outside">Outside</button>
      @if (callerShown()) {
        <toast-caller (added)="callerShown.set(false)" />
      }
      <output data-testid="last-id">{{ lastId() }}</output>
      <output data-testid="bad-duration-error">{{ badDurationError() }}</output>
      <output data-testid="main-config">{{ mainDuration() }} {{ mainLimit() }}</output>
      <output data-testid="config-error">{{ configError() }}</output>
      <output data-testid="toaster-injectable">{{ baseInjectable }} {{ subclassInjectable }}</output>
      <output data-testid="region-state">{{ titles(region.state.toasts()) }}</output>
      <output data-testid="same-data">{{ region.state.toasts()[0]?.data === lastData() }}</output>

      <section
        [ogToastRegion]="toasts"
        #region="ogToastRegion"
        [duration]="mainDuration()"
        [limit]="mainLimit()"
        aria-label="Notifications"
        data-testid="region"
        class="region"
      >
        <span regionStateProbe data-testid="region-probe"></span>
        <ol data-testid="region-list">
          @if (listShown()) {
            @for (toast of region.state.toasts(); track toast.id) {
              <li
                [ogToast]="toast"
                #item="ogToast"
                [attr.data-testid]="'toast-' + toast.data.title"
                [attr.data-motion]="toast.data.motion ?? null"
                [attr.data-open]="item.state.open()"
              >
                <span
                  toastStateProbe
                  tabindex="-1"
                  [attr.data-testid]="'probe-' + toast.data.title"
                >
                  {{ toast.data.title }}
                </span>
                @if (closesShown()) {
                  <button
                    ogToastClose
                    [attr.data-testid]="'close-' + toast.data.title"
                    aria-label="Close"
                  >
                    ×
                  </button>
                }
              </li>
            }
          }
        </ol>
      </section>
      @if (secondRegion()) {
        <section [ogToastRegion]="toasts" aria-label="Duplicate" data-testid="second-region"></section>
      }
      <button type="button" data-testid="mount-second-region" (click)="secondRegion.set(true)">
        Mount a second region on the same toaster
      </button>
    </section>

    <section>
      <h2>Replaced Options</h2>
      <button type="button" data-testid="other-add" (click)="addTo(other, 'Other')">
        Add to the other toaster
      </button>
      <section
        [appToastRegion]="toasts"
        #factoryRegion="appToastRegion"
        [duration]="100"
        [limit]="5"
        aria-label="Other notifications"
        data-testid="factory-region"
      >
        <output data-testid="factory-region-state">{{ titles(factoryRegion.state.toasts()) }}</output>
        <ol>
          @for (toast of factoryRegion.state.toasts(); track toast.id) {
            <li
              [factoryToast]="decoy"
              [record]="toast"
              [attr.data-testid]="'toast-' + toast.data.title"
            >
              <span toastStateProbe [attr.data-testid]="'probe-' + toast.data.title">
                {{ toast.data.title }}
              </span>
              <button factoryClose [attr.data-testid]="'factory-close-' + toast.data.title">
                Disabled close
              </button>
              <button ogToastClose [attr.data-testid]="'close-' + toast.data.title">Close</button>
            </li>
          }
        </ol>
      </section>

      <button type="button" data-testid="third-add" (click)="addTo(third, 'Third')">
        Add to the third toaster
      </button>
      <section
        [existingRegion]="toasts"
        #existingRegion="existingRegion"
        aria-label="Third notifications"
        data-testid="existing-region"
      >
        <output data-testid="existing-region-state">
          {{ titles(existingRegion.state.toasts()) }}
        </output>
        <ol>
          @for (toast of existingRegion.state.toasts(); track toast.id) {
            <li
              [existingDecoy]="decoy"
              [existingToast]="toast"
              [attr.data-testid]="'toast-' + toast.data.title"
            >
              <span toastStateProbe [attr.data-testid]="'probe-' + toast.data.title">
                {{ toast.data.title }}
              </span>
              <button existingClose [disabled]="true" [attr.data-testid]="'close-' + toast.data.title">
                Close
              </button>
            </li>
          }
        </ol>
      </section>
    </section>

    <section>
      <h2>Waiting</h2>
      <button type="button" data-testid="late-add" (click)="addTo(late, 'Late')">
        Add to the late toaster
      </button>
      <button type="button" data-testid="late-add-exit" (click)="addLateExit()">
        Add with an exit to the late toaster
      </button>
      <button type="button" data-testid="late-close-exit" (click)="late.close(lateExitId())">
        Close the late toast with an exit
      </button>
      <button type="button" data-testid="late-mount" (click)="lateMounted.set(true)">
        Mount the late region
      </button>
      <button type="button" data-testid="late-unmount" (click)="lateMounted.set(false)">
        Unmount the late region
      </button>
      @if (lateMounted()) {
        <section
          [ogToastRegion]="late"
          #lateRegion="ogToastRegion"
          aria-label="Late notifications"
          data-testid="late-region"
        >
          <ol>
            @for (toast of lateRegion.state.toasts(); track toast.id) {
              <li
                [ogToast]="toast"
                [attr.data-testid]="'toast-' + toast.data.title"
                [attr.data-motion]="toast.data.motion ?? null"
              >
                {{ toast.data.title }}
              </li>
            }
          </ol>
        </section>
      }

      <button type="button" data-testid="deferred-add" (click)="addTo(deferred, 'Deferred')">
        Add to the deferred toaster
      </button>
      <button type="button" data-testid="deferred-hydrate" (click)="deferredHydrated.set(true)">
        Hydrate the deferred region
      </button>
      <acceptance-toast-lifetime />

      @defer (hydrate when deferredHydrated()) {
        <section
          [ogToastRegion]="deferred"
          #deferredRegion="ogToastRegion"
          aria-label="Deferred notifications"
          data-testid="deferred-region"
        >
          <ol>
            @for (toast of deferredRegion.state.toasts(); track toast.id) {
              <li [ogToast]="toast" [attr.data-testid]="'toast-' + toast.data.title">
                {{ toast.data.title }}
              </li>
            }
          </ol>
        </section>
      } @placeholder {
        <p>Deferred region</p>
      }
    </section>
  `,
  styles: `
    [data-motion="exit"][data-leaving] {
      animation: toast-exit 300ms linear forwards;
    }

    [data-motion="long"][data-leaving] {
      animation: toast-exit 1500ms linear forwards;
    }

    @media (prefers-reduced-motion: no-preference) {
      [data-motion="reduce-aware"][data-leaving] {
        animation: toast-exit 300ms linear forwards;
      }
    }

    @keyframes toast-exit {
      to {
        opacity: 0;
      }
    }
  `,
})
export class ToastFixture {
  readonly toasts = inject(FixtureToasts);
  readonly other = inject(OtherToasts);
  readonly third = inject(ThirdToasts);
  readonly late = inject(LateToasts);
  readonly deferred = inject(DeferredToasts);
  readonly decoy = decoy;
  readonly Infinity = Infinity;
  readonly attached = signal(false);
  readonly lastId = signal("");
  readonly lastData = signal<FixtureToast | null>(null);
  readonly badDurationError = signal("");
  readonly mainDuration = signal(60000);
  readonly mainLimit = signal(3);
  readonly configError = signal("");
  readonly lateExitId = signal("");
  readonly closesShown = signal(true);
  readonly listShown = signal(true);
  readonly #root = inject(ApplicationRef).injector;
  /** Whether the root injector resolves the abstract base: it mustn't, it has no provider. */
  readonly baseInjectable = this.#root.get(OrigamiToaster, null) !== null;
  /** Whether the root injector resolves the consumer's `@Service()` subclass. */
  readonly subclassInjectable = this.#root.get(FixtureToasts, null) !== null;
  readonly callerShown = signal(true);
  readonly secondRegion = signal(false);
  readonly lateMounted = signal(false);
  readonly deferredHydrated = signal(false);
  /** The id `add` returned on the server, where it keeps nothing; absent in the browser. */
  readonly serverAdd: string | null = null;
  readonly #router = inject(Router);
  readonly #counts = new Map<string, number>();

  constructor() {
    if (isPlatformServer(inject(PLATFORM_ID))) {
      this.serverAdd = this.toasts.add({ title: "Server" });
    }
  }

  titles(records: readonly OrigamiToastRecord<FixtureToast>[]): string {
    const titles: string[] = [];

    for (const record of records) {
      titles.push(record.data.title);
    }

    return titles.join(" ");
  }

  add(extra: Omit<FixtureToast, "title"> = {}, duration?: number): void {
    const data: FixtureToast = { title: this.#next("T"), ...extra };

    this.lastData.set(data);

    if (duration === undefined) {
      this.lastId.set(this.toasts.add(data));
    } else {
      this.lastId.set(this.toasts.add(data, { duration }));
    }
  }

  addTo(toaster: OrigamiToaster<FixtureToast>, prefix: string): void {
    toaster.add({ title: this.#next(prefix) });
  }

  /** Closes a toast in the handler that added it, before Angular renders it. */
  addAndClose(): void {
    const id = this.toasts.add({ title: this.#next("T") });

    this.toasts.close(id);
  }

  /** Four toasts before the next render: the limit of 3 closes the oldest before it renders. */
  addFour(): void {
    for (let count = 0; count < 4; count += 1) {
      this.toasts.add({ title: this.#next("T") });
    }
  }

  addLateExit(): void {
    this.lateExitId.set(this.late.add({ title: this.#next("Late"), motion: "exit" }));
  }

  showAll(): void {
    this.listShown.set(true);
    this.closesShown.set(true);
  }

  fixConfig(): void {
    this.mainDuration.set(60000);
    this.mainLimit.set(3);
  }

  /** Adds with the region's configuration, which may be invalid: a RangeError is shown. */
  tryAdd(): void {
    try {
      this.toasts.add({ title: this.#next("T") });
    } catch (error) {
      if (error instanceof RangeError) {
        this.configError.set(`RangeError: ${error.message}`);
      }
    }
  }

  /** Adds with an invalid duration of its own: the RangeError is shown. */
  badDuration(duration: number): void {
    try {
      this.toasts.add({ title: "Bad" }, { duration });
    } catch (error) {
      if (error instanceof RangeError) {
        this.badDurationError.set(`RangeError: ${error.message}`);
      }
    }
  }

  navigate(): void {
    void this.#router.navigate([], { queryParams: { n: this.#next("q") } });
  }

  #next(prefix: string): string {
    const count = (this.#counts.get(prefix) ?? 0) + 1;

    this.#counts.set(prefix, count);

    return `${prefix}${count}`;
  }
}
