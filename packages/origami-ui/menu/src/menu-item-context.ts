import { DestroyRef, ElementRef, Service, inject } from "@angular/core";
import type { Signal } from "@angular/core";
import { Subject } from "rxjs";
import type { Observable } from "rxjs";
import { MenuContentContext } from "./menu-content-context";

/**
 * @internal One item's private owner, for `ogMenuItem` and `ogMenuLink`: its registration with
 * its menu, its focus, its hover and its `select` event, which State and the directive's output re-expose.
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

  /** Registers the item with its menu from its `ngOnInit`; `destroyRef` removes it. */
  register(
    item: { readonly disabled: Signal<boolean>; readonly label: Signal<string | null> },
    destroyRef: DestroyRef,
  ): void {
    this.#content.register(
      { element: this.#element, disabled: item.disabled, label: item.label },
      destroyRef,
    );
  }

  /** Activates the item through its menu's one activation path; the caller checked its disabled state. */
  activate(): void {
    if (!this.#destroyed) {
      this.#content.activate(() => this.#selects.next());
    }
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
