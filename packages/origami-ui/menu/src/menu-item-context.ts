import { DestroyRef, ElementRef, Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { Subject } from "rxjs";
import type { Observable } from "rxjs";
import { MenuContentContext } from "./menu-content-context";

/**
 * @internal One item's private owner, for `ogMenuItem`, `ogMenuLink` and the checkable items: its
 * registration with its menu, its focus, its hover and its `select` event, which State and the
 * directive's output re-expose.
 */
@Service({ autoProvided: false })
export class MenuItemContext {
  readonly #content = inject(MenuContentContext);
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #selects = new Subject<void>();
  #destroyed = false;

  /** Emits synchronously when the item is activated, after the menu focused its Trigger and closed. */
  readonly selects: Observable<void> = this.#selects.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#selects.complete();
    });
  }

  /**
   * Registers the item with its menu from its `ngOnInit`; `destroyRef` removes it. A checkable item
   * passes `write`, its state write: its menu then handles its Enter on keydown, through `check`.
   */
  register(
    item: { readonly disabled: Signal<boolean>; readonly label: Signal<string | null> },
    destroyRef: DestroyRef,
    write: (() => void) | null = null,
  ): void {
    let enter: (() => void) | null = null;

    if (write !== null) {
      enter = () => this.check(write, true);
    }

    this.#content.register(
      { element: this.#element, disabled: item.disabled, label: item.label, enter },
      destroyRef,
    );
  }

  /** Activates the item through its menu's one activation path; the caller checked its disabled state. */
  activate(): void {
    if (!this.#destroyed) {
      this.#content.activate(() => this.#selects.next(), true);
    }
  }

  /**
   * A checkable item's activation through the same path, `write` being its state write. Its Enter
   * (`close` true) focuses the Trigger and closes the menu, then runs `write`, then emits; its click,
   * from Space, the pointer or a script, runs `write` and emits, leaving the menu open and focus on
   * the item. A focus or `openChange` listener that destroys the item, or the write's own listener,
   * ends it there. The caller checked its disabled state.
   */
  check(write: () => void, close: boolean): void {
    if (this.#destroyed) {
      return;
    }

    this.#content.activate(() => {
      // Closing ran focus and `openChange` listeners: with the item gone, its Options may be
      // shared with a replacement's, so nothing is written or emitted.
      if (this.#destroyed) {
        return;
      }

      write();

      if (!this.#destroyed) {
        this.#selects.next();
      }
    }, close);
  }

  /** The item's `focus`: the menu records it as the focused item. */
  focused(): void {
    if (!this.#destroyed) {
      this.#content.focused(this.#element);
    }
  }

  /** The item's `blur`. */
  blurred(): void {
    if (!this.#destroyed) {
      this.#content.blurred(this.#element);
    }
  }

  /** The item's `pointermove`. */
  hovered(event: PointerEvent): void {
    if (!this.#destroyed) {
      this.#content.hovered(this.#element, event);
    }
  }
}
