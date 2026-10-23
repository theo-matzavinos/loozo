import { Directive, booleanAttribute, forwardRef, inject, input, model } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";
import {
  OrigamiDialog,
  OrigamiDialogOptions,
  OrigamiDialogState,
  ɵOrigamiDialogRole,
} from "./dialog";

/** Whole, substitutable AlertDialog root configuration, resolved after construction. */
export abstract class OrigamiAlertDialogOptions {
  /**
   * Requested open state, writable by behavior; direct model default false. Not whether the
   * dialog is modal now: the native session outlives a close through Content's exit.
   */
  abstract readonly open: WritableSignal<boolean>;
  /**
   * User-dismissal permission, direct default true: Escape and a close request such as the back
   * gesture. A backdrop click never dismisses an alert dialog. Close buttons and writes to
   * `open` always close.
   */
  abstract readonly dismissible: Signal<boolean>;

  /**
   * Replaces all AlertDialog root Options with an existing compatible provider.
   * @param type - Supplier of a compatible concrete or abstract provider class; supports forward
   *   references.
   * @returns A local provider; the composed Dialog root reads this token.
   */
  static provideExisting(
    type: () => Type<OrigamiAlertDialogOptions> | AbstractType<OrigamiAlertDialogOptions>,
  ): Provider {
    return { provide: OrigamiAlertDialogOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all AlertDialog root Options, without merging unused directive defaults.
   * @param factory - Injection-context factory supplying `open` and `dismissible`. Ordinary
   *   writable signals are valid.
   * @returns A local provider; writes do not fabricate outputs from an unused directive model.
   */
  static provideFactory(factory: () => OrigamiAlertDialogOptions): Provider {
    return { provide: OrigamiAlertDialogOptions, useFactory: factory };
  }
}

/**
 * Modal alert dialog owner: a Dialog root (`OrigamiDialog`, composed) for a dialog that
 * interrupts to ask for a decision, such as confirming a delete. It uses Dialog's own parts
 * (Trigger, Content, Title, Description, Close) and behaves the same, except:
 *
 * - Content renders `role="alertdialog"`, also on the server.
 * - A backdrop click never dismisses it. Escape and close requests such as the back gesture or
 *   `requestClose()` still do, unless `dismissible` is false; Close buttons and writes to `open`
 *   always close it. A Popover open inside still closes on a backdrop click.
 *
 * Cancel is an `ogDialogClose` button; put `autofocus` on it so the safe choice gets initial
 * focus. The Action is your own button: it doesn't close the dialog, so it can stay open while
 * a request is pending or after it fails. Name the dialog with a Title and describe it with a
 * Description. A component can be the root through `hostDirectives`.
 *
 * @example
 * ```html
 * <div ogAlertDialog [(open)]="confirmOpen" [dismissible]="!pending()">
 *   <dialog ogDialogContent>
 *     <h2 ogDialogTitle>Delete invoice?</h2>
 *     <p ogDialogDescription>This can't be undone.</p>
 *     <button ogDialogClose autofocus [disabled]="pending()">Cancel</button>
 *     <button ogButton [disabled]="pending()" (click)="delete()">Delete</button>
 *   </dialog>
 * </div>
 * ```
 */
@Directive({
  selector: "[ogAlertDialog]",
  exportAs: "ogAlertDialog",
  hostDirectives: [OrigamiDialog],
  providers: [
    OrigamiAlertDialogOptions.provideExisting(() => OrigamiAlertDialog),
    OrigamiDialogOptions.provideExisting(() => OrigamiAlertDialogOptions),
    { provide: ɵOrigamiDialogRole, useValue: "alertdialog" },
  ],
})
export class OrigamiAlertDialog implements OrigamiAlertDialogOptions {
  /** Own requested-state model, default false; `openChange` emits accepted writes to this model. Replaced Options do not emit unused model outputs. */
  readonly open = model(false);
  /**
   * Own boolean-attribute-coerced user-dismissal input, default true. False vetoes Escape and
   * close requests; a backdrop click never dismisses, and Close buttons and `open` writes still
   * close. Replaced Options drive effective policy.
   */
  readonly dismissible = input(true, { transform: booleanAttribute });
  /** Local readonly facade of effective root Options, from the composed Dialog root. */
  readonly state = inject(OrigamiDialogState);
}
