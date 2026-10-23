import {
  DestroyRef,
  Directive,
  ElementRef,
  Service,
  computed,
  forwardRef,
  inject,
  input,
  linkedSignal,
} from "@angular/core";
import type { AbstractType, Provider, Signal, Type } from "@angular/core";
import {
  OrigamiPresence,
  OrigamiPresenceOptions,
  OrigamiPresenceState,
  ɵOrigamiPresencePresentation,
} from "@loozo/origami-ui/presence";
import { injectDeferred, injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { DialogContext } from "./dialog";
import { DialogDescriptions } from "./dialog-description";
import { DialogSession } from "./dialog-session";

/** Whole, substitutable Content configuration, resolved after construction. */
export abstract class OrigamiDialogContentOptions {
  /** Effective reactive DOM ID; the Trigger's `aria-controls` names it while Content is mounted. */
  abstract readonly id: Signal<string>;
  /**
   * Where focus goes once the dialog has closed, default null. Read when the native session
   * ends; used only if focusing it then succeeds, so not when it's disabled, disconnected or
   * inert, including blocked by another modal dialog. Otherwise the
   * browser returns focus to what had it before the dialog opened, and if that left focus on the
   * document body or inside the closed dialog, an eligible Trigger gets it.
   */
  abstract readonly returnFocus: Signal<HTMLElement | null>;

  /**
   * Replaces every Content Option with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; forward references
   *   are supported.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiDialogContentOptions> | AbstractType<OrigamiDialogContentOptions>,
  ): Provider {
    return { provide: OrigamiDialogContentOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces every Content Option, without merging unused directive defaults.
   * @param factory - Runs in injection context; supply `id` and `returnFocus` signals.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiDialogContentOptions): Provider {
    return { provide: OrigamiDialogContentOptions, useFactory: factory };
  }
}

/** Local readonly observation of Content's composed Presence, not a separate writable alias. */
@Service({ autoProvided: false })
export class OrigamiDialogContentState {
  readonly #presence = inject(OrigamiPresenceState);
  /**
   * True while the dialog is requested open and through its exit, while it's still modal; gate
   * children on it to keep them through the exit. SSR retains initially-open children.
   */
  readonly open: Signal<boolean> = this.#presence.open;
}

/**
 * What the element's `aria-labelledby` at construction is: `pending` until the Title IDs first
 * equal it exactly, then `server` from then on (a hydrated element carries the server's output).
 */
type Snapshot = "pending" | "server";

/**
 * The native `<dialog>` a Dialog shows modally with `showModal()`, in the browser's top layer
 * with its `::backdrop`, the rest of the page inert. It stays where it's authored. Requires a
 * nearest Dialog; a second mounted Content fails clearly.
 *
 * - **Open.** Once the root requests open and Content is connected, `showModal()` runs after
 *   render; never on the server. Content never binds the `open` attribute, which would make the
 *   dialog non-modal: don't author one. Native rules choose initial focus: an `autofocus`
 *   element, else the first focusable one, else the dialog. No `tabindex` goes on the dialog.
 * - **Close.** A requested close runs Presence's exit while the dialog stays modal (page inert,
 *   focus inside), then `close()` runs and focus is returned: `returnFocus` if eligible,
 *   otherwise the browser's restore, then an eligible Trigger if focus was left on the body or
 *   inside the closed dialog.
 *   Reopening during the exit continues the same modal session. Open Popovers and Tooltips
 *   inside are hidden at once when the close is requested, keeping their `open`; one already
 *   closing finishes its own exit, hidden no later than the dialog's `close()`.
 * - **Dismissal.** Escape goes to the most recently shown Origami layer inside the dialog, so a
 *   Popover or Tooltip inside closes first and one outside, inert, never takes it. A cancelable native close request (`cancel`: the back gesture,
 *   `requestClose()`) is prevented and handled like Escape; on a dialog under a newer one it
 *   closes this dialog's own Popovers and itself, not the newer one. A click on the backdrop
 *   dismisses it, unless a Popover inside is open: then only that Popover closes; an alert
 *   dialog's backdrop closes only such a Popover, never the dialog. During the
 *   exit the dialog still consumes Escape, close requests and backdrop clicks without acting on
 *   them. The root's `dismissible` vetoes all of them. `closedby` isn't used. Inside means inside
 *   the `<dialog>` in the flat tree, read from the DOM: also projected through a wrapper's
 *   `<ng-content>`, in a shadow root, or slotted.
 * - **Native closes.** A close Origami didn't start (`<form method="dialog">`, a direct
 *   `close()`, a forced close request) writes `open` false without an exit animation; State
 *   `open` turns false without waiting for Content's animations, also during an exit.
 * - **Removed while modal.** The session ends without an exit and focus is returned as above.
 * - **Scroll.** `<html>` has `overflow: hidden` while any Origami dialog is modal; its previous
 *   inline `overflow-x` and `overflow-y` come back after the last one closes. Use `scrollbar-gutter` against shift.
 * - **Names.** `aria-labelledby` names the registered Titles, in registration order; with none, a
 *   static `aria-labelledby` is kept. Descriptions inside Content are added to
 *   `aria-describedby`, shared with other describers on the element. The role is the native
 *   dialog's; under an `OrigamiAlertDialog` root, `role="alertdialog"`.
 *
 * SSR renders Content without `open`, so it's hidden; after eager or incremental hydration a
 * requested-open dialog opens modally, without replaying an entrance. Presence waits only for
 * Content's own animations, not `::backdrop`'s.
 */
@Directive({
  selector: "dialog[ogDialogContent]",
  exportAs: "ogDialogContent",
  hostDirectives: [ɵOrigamiDescribedBy, OrigamiPresence],
  providers: [
    DialogSession,
    ɵOrigamiPresencePresentation,
    DialogDescriptions,
    OrigamiDialogContentState,
    OrigamiDialogContentOptions.provideExisting(() => OrigamiDialogContent),
    OrigamiPresenceOptions.provideFactory(() => ({ present: inject(DialogContext).desired })),
  ],
  host: {
    "[id]": "effectiveId()",
    "[attr.role]": "role",
    "[attr.aria-labelledby]": "labelledBy()",
    "(cancel)": "cancel($event)",
    "(close)": "nativeClose($event)",
  },
})
export class OrigamiDialogContent implements OrigamiDialogContentOptions {
  /** Own ID input, default a generated opaque hosted identity, stable across hydration. Replaced Options supply the effective ID. */
  readonly id = input(injectUniqueId("dialog-content"));
  /**
   * Own focus-return input, default null: the element focused after the dialog closes when it
   * can take focus, such as a row's next action when the row that opened the
   * dialog is gone. Replaced Options supply the effective target.
   */
  readonly returnFocus = input<HTMLElement | null>(null);
  /** Readonly Presence retention: true while requested open and through the exit. */
  readonly state = inject(OrigamiDialogContentState);

  readonly #element = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  readonly #context = inject(DialogContext);
  readonly #session = inject(DialogSession);
  readonly #describedBy = inject(ɵOrigamiDescribedBy);
  readonly #descriptions = inject(DialogDescriptions);
  readonly #options = injectDeferred(OrigamiDialogContentOptions);
  readonly #destroyRef = inject(DestroyRef);
  readonly #initialLabelledBy = this.#element.getAttribute("aria-labelledby");
  readonly #snapshot = linkedSignal<string, Snapshot>({
    source: this.#context.titleIds,
    computation: (ids, previous) => {
      if (previous?.value === "server") {
        return "server";
      }

      if (ids !== "" && ids === this.#initialLabelledBy) {
        return "server";
      }

      return "pending";
    },
  });

  /** @internal Effective host identity. */
  protected readonly effectiveId = computed(() => this.#options().id());
  /** @internal An alert dialog's role; a dialog keeps the native one. */
  protected readonly role = this.#roleAttribute();
  /** @internal Registered Title IDs, or the static value while none is registered. */
  protected readonly labelledBy = computed(() => {
    const ids = this.#context.titleIds();
    // Read on every evaluation, so the snapshot sees every list of IDs the attribute renders.
    const snapshot = this.#snapshot();

    if (ids !== "") {
      return ids;
    }

    if (snapshot === "server") {
      return null;
    }

    return this.#initialLabelledBy;
  });

  /** @internal Registers Content and its Descriptions once Angular has set its inputs; a second mounted Content fails clearly. */
  ngOnInit(): void {
    this.#context.registerContent(this.#session.part, this.#destroyRef);
    this.#describedBy.register(() => this.#descriptions.ids(), this.#destroyRef);
  }

  /** @internal A native close request on this dialog; bubbled descendant events are ignored. */
  protected cancel(event: Event): void {
    if (event.target === this.#element) {
      this.#session.cancel(event);
    }
  }

  /** @internal A native close of this dialog; bubbled descendant events are ignored. */
  protected nativeClose(event: Event): void {
    if (event.target === this.#element) {
      this.#session.nativeClose();
    }
  }

  #roleAttribute(): string | null {
    if (this.#context.role === "alertdialog") {
      return "alertdialog";
    }

    return null;
  }
}
