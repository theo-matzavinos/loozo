import { Directive, computed, inject, linkedSignal } from "@angular/core";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { FileFieldContext } from "./file-field-context";

/**
 * Whether Angular is replaying an event that reached the zone before it hydrated: its data store
 * is no longer readable, and the browser's default already happened.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/** Whether a drag carries files: `"Files"` is in its types, in every drag event's protected mode. */
function carriesFiles(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

/**
 * The file drag events a zone has handled. A drag event bubbles from the innermost zone around its
 * target outwards, so an enclosing zone, of the same or another file field, finds it here and
 * leaves it alone: the innermost zone owns it. A `WeakSet` leaves the event itself untouched and
 * lets it go once dispatched.
 */
const handled = new WeakSet<Event>();

/**
 * Whether this zone owns `event`, which it then claims: a file drag Angular isn't replaying, which
 * no zone inside this one handled.
 */
function claim(event: DragEvent): boolean {
  if (replayed(event) || !carriesFiles(event) || handled.has(event)) {
    return false;
  }

  handled.add(event);

  return true;
}

/**
 * An optional drop target of a file field: any element inside the root, or the root's own element,
 * such as the `<label>` around the Input, so a click on it opens the picker too. Dropping a file
 * on it writes the same value a pick does. It has no inputs, no Options and no `state`; it
 * registers nothing. Requires a nearest file field root.
 *
 * Drags: only drags that carry files count; text and link drags are ignored and not accepted. The
 * zone counts the file drag's `dragenter`s and `dragleave`s over itself and its descendants, so
 * `data-drag-over` stays present as the pointer crosses its children, and is removed when the
 * drag leaves or drops. It cancels a file drag's `dragover`, with `dropEffect` `"copy"`, and its
 * `drop`, so the browser doesn't open the file; the drop writes the first file and touches the
 * field. It never stops propagation, so the consumer's own listeners still see every event.
 *
 * Nested zones: the innermost zone around the drag owns its events. An enclosing zone, of the same
 * root or another, ignores the events a zone inside it handled, enabled or disabled: it isn't
 * highlighted while the drag is over the inner zone, sets no `dropEffect` and selects nothing for
 * it, and is highlighted again once the drag is back over its own area.
 *
 * Disabled: no `data-drag-over`, and the count restarts at 0, so a drag entered before disabling
 * doesn't show again on enabling. A file drag's `dragover` is still cancelled, with `dropEffect`
 * `"none"`, so the browser delivers no `drop`, writes nothing and doesn't open the file.
 *
 * The zone has no keyboard role of its own: the Input inside or beside it is the keyboard and
 * single-pointer alternative. A drop before the zone hydrates gets an enclosing hydrated zone's
 * handling, or else the browser's default, as does one outside every zone. A drag cancelled with
 * Escape from an in-page source carrying files may leave `data-drag-over` in Firefox, which sends
 * the zone no `dragleave`, until the next drop on it or its remount. Shadow-DOM and slotted zones
 * are untested.
 *
 * Host semantics: an empty `data-drag-over` while a file drag is over it and the field is
 * enabled; absent otherwise, and in server HTML.
 *
 * @example
 * ```html
 * <label ogFileFieldDropZone class="zone">
 *   Choose a file or drag it here <input ogFileFieldInput class="sr-only" />
 * </label>
 * ```
 */
@Directive({
  selector: "[ogFileFieldDropZone]",
  host: {
    "[attr.data-drag-over]": "dragOver()",
    "(dragenter)": "entered($event)",
    "(dragover)": "over($event)",
    "(dragleave)": "leaving($event)",
    "(drop)": "dropped($event)",
  },
})
export class OrigamiFileFieldDropZone {
  readonly #context = inject(FileFieldContext);
  /**
   * The file drag's `dragenter`s over the zone and its descendants not yet left. A change of
   * disabled discards it once read, so a drag entered before disabling doesn't show again on
   * enabling.
   */
  readonly #depth = linkedSignal({ source: this.#context.disabled, computation: () => 0 });

  /** @internal Empty while a file drag is over the zone of an enabled field, else absent. */
  protected readonly dragOver = computed(() => {
    if (this.#depth() > 0 && !this.#context.disabled()) {
      return "";
    }

    return null;
  });

  /** @internal A file drag entered the zone or one of its descendants. */
  protected entered(event: DragEvent): void {
    if (!claim(event)) {
      return;
    }

    if (this.#context.disabled()) {
      this.#depth.set(0);

      return;
    }

    this.#depth.update((depth) => depth + 1);
  }

  /** @internal Accepts a file drag, or refuses it while disabled, so the browser opens nothing. */
  protected over(event: DragEvent): void {
    if (!claim(event)) {
      return;
    }

    event.preventDefault();

    const disabled = this.#context.disabled();

    if (disabled) {
      this.#depth.set(0);
    }

    if (event.dataTransfer !== null) {
      event.dataTransfer.dropEffect = disabled ? "none" : "copy";
    }
  }

  /** @internal A file drag left the zone or one of its descendants. */
  protected leaving(event: DragEvent): void {
    if (!claim(event)) {
      return;
    }

    if (this.#context.disabled()) {
      this.#depth.set(0);

      return;
    }

    this.#depth.update((depth) => Math.max(0, depth - 1));
  }

  /**
   * @internal A file drop: the browser doesn't open it; its first file, read now while the data
   * store is readable, is the user's choice.
   */
  protected dropped(event: DragEvent): void {
    if (!claim(event)) {
      return;
    }

    event.preventDefault();
    this.#depth.set(0);

    if (this.#context.disabled()) {
      return;
    }

    this.#context.select(event.dataTransfer?.files[0] ?? null, { touch: true });
  }
}
