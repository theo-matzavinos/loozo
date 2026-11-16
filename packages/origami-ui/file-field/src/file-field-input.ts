import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  afterNextRender,
  afterRenderEffect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { EventPhase } from "@angular/core/primitives/event-dispatch";
import { ɵOrigamiFieldMembership } from "@loozo/origami-ui/field";
import { injectUniqueId, ɵOrigamiDescribedBy } from "@loozo/origami-ui/utils";
import { FileFieldContext } from "./file-field-context";

/**
 * Whether Angular is replaying an event that reached the server-rendered Input before it
 * hydrated: eager hydration's replay marks it `EventPhase.REPLAY`; incremental hydration's calls
 * the listeners with the browser's event after its dispatch has ended, in phase `NONE`.
 */
function replayed(event: Event): boolean {
  return event.eventPhase === EventPhase.REPLAY || event.eventPhase === Event.NONE;
}

/**
 * The native file input of a file field: a native `<input>` the directive makes `type="file"`,
 * the field's one control. Its picker, its keyboard access (Enter and Space open the picker), its
 * accessible role, a button, and its Field label all stay native. Hide it visually, never with
 * `display: none` or `hidden`, which take it out of the keyboard and accessibility tree, and name
 * it with a `<label>`, which opens the picker on click before and after hydration. It has no
 * inputs and no `state`: read the root's. Requires a nearest file field root, which supports one
 * mounted Input; a second fails when it registers.
 *
 * Selection: a genuine `change` writes its first file, or null, to the root's value and touches
 * the field. Its native `files` mirrors the root's value after each render in the browser: a
 * dropped or written `File` becomes its one file, null empties it. Leaving it touches the field.
 * `accept`, `capture` and similar native attributes are the consumer's and untested; don't add
 * `multiple`: the mirror keeps one file.
 *
 * Host semantics: static `type="file"`; its static `id`, else a generated one kept through
 * hydration; native `disabled` from the root.
 *
 * Field: inside an `ogField` it is the Field's control, governed by the `[formField]` on the
 * root; don't add `ogFieldControl`. The Field's Labels name it with `for`, and its
 * `aria-describedby` names the Field's Descriptions, then its mounted Errors, merged with the IDs
 * of a co-applied `ogTooltipTrigger` in the order they initialize. It carries
 * `aria-invalid="true"` while the Field shows its errors and `aria-required="true"` while the
 * bound field is required, absent otherwise. Outside a Field, and as a second control the Field
 * ignores, it keeps its static ARIA attributes.
 *
 * Hydration: a file picked in the server-rendered Input before its block hydrates is adopted at
 * its first render as a pick that touches; Angular's replay of its `change` isn't another pick. A
 * blur before then is delivered once the root has rendered, unless this Input is destroyed first.
 *
 * @example
 * ```html
 * <div ogFileField [(value)]="attachment">
 *   <label class="choose">Choose a file <input ogFileFieldInput class="sr-only" /></label>
 * </div>
 * ```
 */
@Directive({
  selector: "input[ogFileFieldInput]",
  hostDirectives: [ɵOrigamiDescribedBy],
  host: {
    type: "file",
    "[attr.id]": "id",
    "[disabled]": "disabled()",
    "[attr.aria-invalid]": "invalid()",
    "[attr.aria-required]": "required()",
    "(change)": "changed($event)",
    "(blur)": "left()",
  },
})
export class OrigamiFileFieldInput {
  readonly #context = inject(FileFieldContext);
  readonly #element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);

  /** @internal A static `id` from the template, else a generated one kept through hydration. */
  protected readonly id =
    inject(new HostAttributeToken("id"), { optional: true }) ?? injectUniqueId("file-field-input");

  readonly #membership = new ɵOrigamiFieldMembership(() => this.id, {
    labelable: true,
    formState: () => this.#context.formState(),
  });
  /**
   * Set once the first render's adoption has run: until then the mirror leaves `files` alone, so
   * it never clears a file picked before hydration.
   */
  readonly #adopted = signal(false);
  /**
   * Bumped by each genuine pick: the pick changed `files`, so the mirror must run even when the
   * effective value settles where its last run saw it, as when a replacement signal undoes the
   * pick's File inside its write.
   */
  readonly #picks = signal(0);

  /** @internal */
  protected readonly disabled = this.#context.disabled;
  /** @internal `"true"` while the Field shows its errors. */
  protected readonly invalid = this.#membership.invalid;
  /** @internal `"true"` while the bound field is required. */
  protected readonly required = this.#membership.required;

  constructor() {
    // A file picked before hydration: a server-rendered Input may hold one; a client-rendered one
    // is empty, so nothing happens. It is a completed choice, so it touches.
    afterNextRender(() => {
      const file = this.#element.files?.[0] ?? null;

      if (file !== null) {
        this.#context.select(file, { touch: true });
      }

      this.#adopted.set(true);
    });

    // The native selection mirrors the value: tracked, so any write to the effective value, a
    // plain replacement signal written from a timer included, schedules it with no consumer
    // binding, and so does each genuine pick, which changed `files` itself. Browser-only: render
    // effects never run on the server.
    afterRenderEffect(() => {
      const value = this.#context.value();

      this.#picks();

      if (!this.#adopted()) {
        return;
      }

      untracked(() => {
        const element = this.#element;

        if (Object.is(element.files?.[0] ?? null, value)) {
          return;
        }

        if (value === null) {
          element.value = "";

          return;
        }

        const transfer = new DataTransfer();

        transfer.items.add(value);
        element.files = transfer.files;
      });
    });
  }

  /** @internal Joins the nearest Field and registers with the root once Angular has set its inputs. */
  ngOnInit(): void {
    this.#membership.register(this.#destroyRef);
    this.#context.registerInput({ element: this.#element, id: this.id }, this.#destroyRef);
  }

  /**
   * @internal A genuine pick: its first file, or null, is the user's choice. A replayed `change`
   * reports a pick the first render already adopted.
   */
  protected changed(event: Event): void {
    if (replayed(event)) {
      return;
    }

    this.#context.select(this.#element.files?.[0] ?? null, { touch: true });
    this.#picks.update((picks) => picks + 1);
  }

  /** @internal Focus left the Input, also in a replayed `blur`: the field is touched. */
  protected left(): void {
    this.#context.touch(this.#destroyRef);
  }
}
