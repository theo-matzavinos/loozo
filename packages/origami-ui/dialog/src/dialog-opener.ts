import {
  ApplicationRef,
  DOCUMENT,
  DestroyRef,
  EnvironmentInjector,
  InjectionToken,
  Injector,
  PLATFORM_ID,
  afterEveryRender,
  createComponent,
  inject,
  inputBinding,
  isWritableSignal,
  outputBinding,
  reflectComponentType,
  twoWayBinding,
  untracked,
} from "@angular/core";
import type {
  Binding,
  ComponentMirror,
  ComponentRef,
  DestroyableInjector,
  InputSignalWithTransform,
  ModelSignal,
  OutputRef,
  Type,
  WritableSignal,
} from "@angular/core";
import { Location, isPlatformServer } from "@angular/common";

/**
 * What `open()` binds on the component it mounts, keyed by property name: each signal input,
 * model and output of `C` is an optional key, typed from its declaration.
 *
 * - An input (`input()`, `input.required()`, a transformed input) takes a getter or a signal of
 *   the type it accepts, its transform's input type for a transformed one. Angular reads it on
 *   every change detection, so a signal keeps the input live.
 * - A model (`model()`) takes a getter, bound one-way, or a `WritableSignal`, bound two-way: the
 *   component's writes reach the signal. Wrap a writable signal as `() => page()` to bind it one-way.
 * - An output (`output()`, `outputFromObservable()`) takes a listener for its payload, called while
 *   the component lives.
 *
 * Plain fields, plain signals and decorator `@Input()`/`@Output()` properties aren't keys.
 * Required inputs are optional keys too, since the type can't tell them apart: one left out
 * throws Angular's NG0950 when the component reads it. Aliased inputs and outputs bind by
 * property name; the opener maps them to their aliases.
 *
 * @example
 * ```ts
 * const bindings: OrigamiDialogBindings<InvoiceSearchDialog> = {
 *   initialCriteria: () => criteria, // input
 *   page: this.page, // model, two-way
 *   search: (criteria) => this.criteria.set(criteria), // output
 * };
 * ```
 */
export type OrigamiDialogBindings<C> = {
  [K in keyof C as C[K] extends InputSignalWithTransform<any, any> | OutputRef<any>
    ? K
    : never]?: C[K] extends ModelSignal<infer T>
    ? (() => T) | WritableSignal<T>
    : C[K] extends InputSignalWithTransform<any, infer W>
      ? () => W
      : C[K] extends OutputRef<infer T>
        ? (value: T) => void
        : never;
};

/**
 * One mounted dialog component, from `open()` until it's torn down. Data leaves through the
 * component's outputs, bound in `open()`; there is no close result.
 */
export abstract class OrigamiDialogRef {
  /**
   * Resolves once, after the dialog has closed and its component is gone: after the exit animation
   * and the native `close()`, the host removed from the document, the component destroyed. It
   * resolves at once, without an exit, when the opener's owner or the application is destroyed,
   * and never rejects. Awaiting it again after it resolved resolves again.
   */
  abstract readonly closed: Promise<void>;

  /**
   * Closes the dialog from outside, like a write of `open` false: the exit animation runs, then
   * the component is torn down. Before the component's first render it's torn down at once and
   * never shown. Calling it again, or after the dialog closed, does nothing. Once torn down, the
   * reference holds nothing of the component.
   */
  abstract close(): void;
}

/**
 * Mounts `C`, an application component whose template holds a Dialog or AlertDialog, opened
 * modally. Returned by `injectOrigamiDialogOpener`.
 */
export interface OrigamiDialogOpener<C> {
  /**
   * Mounts a new instance of the component with `bindings`, appended to the document body, and
   * opens its top-level Dialog root. Every call mounts a separate instance. It may run inside a
   * reactive context, such as an `effect`: it mounts outside it.
   * @param bindings - The component's signal inputs, models and outputs to bind, by property name.
   * @returns The mounted dialog's reference.
   * @throws On the server, before mounting anything; for a key that isn't a signal input, model or
   *   output of the component.
   */
  open(bindings?: OrigamiDialogBindings<C>): OrigamiDialogRef;
}

/** @internal What the claiming root gives its mount. */
export type MountedRoot = {
  /** Writes the root's `open` false, ignoring `dismissible`. */
  readonly close: () => void;
  /** Requested closed with no native session left: the exit and `close()` are done, or it never opened. */
  readonly closed: () => boolean;
  /** Ends its Content's native session now, without an exit, so focus returns before removal. */
  readonly endSession: () => void;
};

/**
 * @internal The bridge between one opened component and its top-level Dialog root, provided by
 * the component's element injector. The root claims it from `ngOnInit` and requests open; after
 * every render, once the root is requested closed and has no native session left, or the root was
 * destroyed, it tears the component down and resolves `closed`.
 */
export class DialogMount extends OrigamiDialogRef {
  override readonly closed: Promise<void>;
  readonly #resolve: () => void;
  // Lifecycle-only references, dropped on disposal so a kept reference holds nothing of the component.
  #release: (() => void) | null;
  #teardown: (() => void) | null = null;
  #root: MountedRoot | null = null;
  // Opened by openers inside this mount's component, in opening order.
  readonly #owned = new Set<DialogMount>();
  #rootDestroyed = false;
  #disposed = false;

  constructor(release: () => void) {
    super();

    let resolve!: () => void;

    this.closed = new Promise((settle) => {
      resolve = settle;
    });
    this.#resolve = resolve;
    this.#release = release;
  }

  /**
   * Whether it still holds anything of its component: the teardown, the release from its opener or
   * the claimed root. Package-private; the acceptance cases read it to check disposal drops them.
   */
  get ɵholdsComponent(): boolean {
    return this.#teardown !== null || this.#release !== null || this.#root !== null;
  }

  /** Sets what tears the mounted component down, once it exists. */
  attach(teardown: () => void): void {
    this.#teardown = teardown;
  }

  /**
   * From the root's `ngOnInit`; a second live top-level root fails like a duplicate part.
   * Destroying the claiming root ends the dialog's session: the next check tears it down.
   */
  claim(root: MountedRoot, destroyRef: DestroyRef): void {
    if (this.#root !== null) {
      throw new Error(
        "A component opened with injectOrigamiDialogOpener supports only one top-level Dialog root.",
      );
    }

    this.#root = root;
    destroyRef.onDestroy(() => {
      if (this.#root === root) {
        this.#root = null;
        this.#rootDestroyed = true;
      }
    });
  }

  override close(): void {
    if (this.#disposed) {
      return;
    }

    // Not rendered yet, nothing to animate, so it's never shown; or its root is already gone.
    if (this.#root === null) {
      this.dispose();

      return;
    }

    this.#root.close();
  }

  /** An opener inside this mount's component opened `mount`, until `mount` is released. */
  own(mount: DialogMount): void {
    this.#owned.add(mount);
  }

  disown(mount: DialogMount): void {
    this.#owned.delete(mount);
  }

  /**
   * From the claimed root's Content, before its native session ends: disposes the dialogs opened
   * inside this one, newest first and each its own owned ones first, so none outlives it.
   */
  disposeOwned(): void {
    for (const mount of [...this.#owned].reverse()) {
      mount.dispose();
    }
  }

  /** After every render, in the READ phase: the session's after-render WRITE has already run. */
  check(): void {
    if (this.#rootDestroyed || (this.#root !== null && this.#root.closed())) {
      this.dispose();
    }
  }

  /**
   * Ends any active session, and through it the dialogs opened inside it first, so focus returns,
   * then tears the component down without an exit and resolves `closed`.
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }

    const teardown = this.#teardown;
    const release = this.#release;

    this.#disposed = true;
    this.#teardown = null;
    this.#release = null;
    // Destroying the component removes its host before Content's own cleanup, too late for the
    // native close to restore focus; a session ended normally makes this a no-op.
    this.#root?.endSession();
    // Destroying the component destroys its root, whose release clears `#root`.
    teardown?.();
    release?.();
    this.#resolve();
  }
}

/**
 * The mount whose component, or a component inside it, creates an opener: the opener's dialogs are
 * disposed before that mount's session ends. Provided beside `DialogMount`, which Dialog roots mask.
 */
const OwningMount = new InjectionToken<DialogMount>("OwningMount");

/** The record's entries as Angular bindings, by template name. */
function bindingsFor<C>(mirror: ComponentMirror<C>, bindings: OrigamiDialogBindings<C>): Binding[] {
  const record: Record<string, unknown> = bindings;
  const result: Binding[] = [];

  for (const key of Object.keys(record)) {
    const value = record[key];

    if (value === undefined) {
      continue;
    }

    const input = mirror.inputs.find((candidate) => candidate.propName === key);

    if (input !== undefined) {
      // A model is an input and an output under one property name.
      const model = mirror.outputs.some((candidate) => candidate.propName === key);

      if (model && isWritableSignal(value)) {
        result.push(twoWayBinding(input.templateName, value));
      } else {
        result.push(inputBinding(input.templateName, value as () => unknown));
      }

      continue;
    }

    const output = mirror.outputs.find((candidate) => candidate.propName === key);

    if (output !== undefined) {
      result.push(outputBinding(output.templateName, value as (event: unknown) => void));

      continue;
    }

    throw new Error(
      `${key} is not a signal input, model or output of ${mirror.type.name}, so the dialog opener can't bind it.`,
    );
  }

  return result;
}

/**
 * Creates an opener for `component`, an application component whose template holds a Dialog
 * (`hostDirectives: [OrigamiDialog]` or `OrigamiAlertDialog`, or one top-level `ogDialog` or
 * `ogAlertDialog` element) with its Content. Call it in an injection context, such as a field
 * initializer; its caller is the opener's owner.
 *
 * Each `open()` mounts a new instance: its element injector's parent is the caller's injector, so
 * it sees the caller's providers; its host is appended to the document body, and Angular checks it
 * like any attached view, also without Zone.js. Its top-level Dialog root, one with no enclosing
 * Dialog root, opens it; a second one fails, and destroying it, such as a template root under
 * `@if`, ends the dialog. Close it like any Dialog, from inside (an
 * `ogDialogClose` button, a write of the root's `open`, Escape, the backdrop) or with the
 * returned reference's `close()`; once the dialog has closed, after its exit animation, the
 * component is destroyed, its host removed, and `closed` resolves.
 *
 * The opener closes every dialog it has open, with their exit, when the URL changes through
 * Angular's `Location` (`go()`, `replaceState()`, and the browser's back and forward, as the
 * router navigates). When its owner or the application is destroyed, it tears them down at once,
 * without an exit, and focus returns as after any close. `open()` throws on the server: render a template Dialog for server HTML.
 *
 * @param component - The standalone component to mount; bindings are typed from its signal
 *   inputs, models and outputs.
 * @returns An opener whose `open()` can run anywhere later, such as in an event handler.
 * @throws When `component` isn't a component.
 *
 * @example
 * ```ts
 * readonly #searchDialog = injectOrigamiDialogOpener(InvoiceSearchDialog);
 *
 * openSearch(): void {
 *   const criteria = this.criteria();
 *
 *   this.#searchDialog.open({
 *     initialCriteria: () => criteria,
 *     search: (criteria) => this.criteria.set(criteria),
 *   });
 * }
 * ```
 */
export function injectOrigamiDialogOpener<C>(component: Type<C>): OrigamiDialogOpener<C> {
  const mirror = reflectComponentType(component);

  if (mirror === null) {
    throw new Error(`${component.name} isn't a component, so the dialog opener can't mount it.`);
  }

  const injector = inject(Injector);
  const environmentInjector = inject(EnvironmentInjector);
  const applicationRef = inject(ApplicationRef);
  const document = inject(DOCUMENT);
  const location = inject(Location);
  const server = isPlatformServer(inject(PLATFORM_ID));
  const owningMount = inject(OwningMount, { optional: true });
  const mounts = new Set<DialogMount>();
  let stopListening: (() => void) | null = null;
  let ownerDestroyed = false;

  /** Newest first, like `DialogMount.disposeOwned`: the stack is torn down from the top. */
  function disposeAll(): void {
    for (const mount of [...mounts].reverse()) {
      mount.dispose();
    }
  }

  inject(DestroyRef).onDestroy(() => {
    ownerDestroyed = true;
    stopListening?.();
    disposeAll();
  });

  /** From the first `open()`: navigation closes, application teardown disposes. */
  function listen(): void {
    if (stopListening !== null) {
      return;
    }

    const stopNavigation = location.onUrlChange(() => {
      for (const mount of mounts) {
        mount.close();
      }
    });
    const stopApplication = applicationRef.onDestroy(disposeAll);

    stopListening = () => {
      stopNavigation();
      stopApplication();
    };
  }

  return {
    open(bindings: OrigamiDialogBindings<C> = {}): OrigamiDialogRef {
      if (server) {
        throw new Error(
          `The dialog opener can't open ${component.name} on the server. Open it from a browser event, or render a template Dialog for server HTML.`,
        );
      }

      if (ownerDestroyed) {
        throw new Error(
          `The dialog opener for ${component.name} can't open it: its owner is destroyed.`,
        );
      }

      const resolved = bindingsFor(mirror, bindings);

      listen();

      // Outside the caller's reactive context: an effect may open a dialog, and Angular rejects a
      // render hook registered inside one.
      return untracked(() => mountComponent(resolved));
    },
  };

  /** Creates, attaches and starts checking one mounted component; on a failure, removes it. */
  function mountComponent(resolved: Binding[]): OrigamiDialogRef {
    const mount: DialogMount = new DialogMount(() => {
      mounts.delete(mount);
      owningMount?.disown(mount);
    });
    const elementInjector: DestroyableInjector = Injector.create({
      providers: [
        { provide: DialogMount, useValue: mount },
        { provide: OwningMount, useValue: mount },
      ],
      parent: injector,
    });
    let componentRef: ComponentRef<C>;

    try {
      componentRef = createComponent(component, {
        environmentInjector,
        elementInjector,
        bindings: resolved,
      });
    } catch (error) {
      elementInjector.destroy();

      throw error;
    }

    mount.attach(() => {
      // Destroying a view attached to ApplicationRef detaches it, removing the host.
      componentRef.destroy();
      elementInjector.destroy();
    });
    mounts.add(mount);
    owningMount?.own(mount);

    try {
      document.body.appendChild(componentRef.location.nativeElement);
      applicationRef.attachView(componentRef.hostView);
      afterEveryRender({ read: () => mount.check() }, { injector: componentRef.injector });
      componentRef.changeDetectorRef.markForCheck();
    } catch (error) {
      mount.dispose();

      throw error;
    }

    return mount;
  }
}
