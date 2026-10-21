import { Directive, ElementRef, computed, inject, linkedSignal, signal } from "@angular/core";
import type { DestroyRef } from "@angular/core";

type Registration = { readonly ids: () => readonly string[] };

/**
 * What the element's `aria-describedby` at construction is: `pending` until the registrations'
 * IDs first equal it exactly, then `server` from then on.
 */
type Snapshot = "pending" | "server";

/**
 * @internal Package-private: the single owner of its element's `aria-describedby`, shared by
 * every Origami directive that describes that element. Not an application authoring API.
 *
 * Compose it only through `hostDirectives`. Angular creates one instance per element however
 * many matched directives compose it, so describers co-applied on one element, such as a Tooltip
 * Trigger and a Field control, share its one `[attr.aria-describedby]` binding instead of
 * overwriting each other. Each describer calls `register` from its `ngOnInit`.
 *
 * The attribute names every registration's IDs, in registration order, which follows Angular's
 * directive order on the element. While no registration names an ID, it is the element's static
 * `aria-describedby`, read when the element is created, so a consumer's value is kept until a
 * describer names something; otherwise it is absent. The element itself holds the static value
 * because Angular writes the template's and every matched directive's static `host` attributes
 * before it creates the element's directives.
 *
 * Under hydration the element is the server's and already carries this binding's output. So once
 * the registrations' IDs, joined with a space, ever equal the construction-time value exactly, it
 * is taken as the server's output, not a static value: from then on there is no static fallback.
 * Until then it stays the fallback, so while no registration names an ID the attribute keeps that
 * value, which is the server HTML. Describers register in different refresh passes, a child
 * component's after the element's host bindings, so the IDs may name only part of the server's
 * list before they name all of it. Two edges follow: a static value equal to exactly the IDs
 * Origami names at any time is treated as absent, and describers that changed while the element
 * was still dehydrated in a separate `@defer` boundary leave the server's IDs as the static value.
 */
@Directive({
  host: { "[attr.aria-describedby]": "describedBy()" },
})
export class ɵOrigamiDescribedBy {
  readonly #initial =
    inject<ElementRef<Element>>(ElementRef).nativeElement.getAttribute("aria-describedby");
  readonly #registrations = signal<readonly Registration[]>([]);

  readonly #ids = computed(() => {
    const ids: string[] = [];

    for (const registration of this.#registrations()) {
      for (const id of registration.ids()) {
        ids.push(id);
      }
    }

    return ids.join(" ");
  });

  /** `server` once the IDs equal the construction-time value, and kept from then on. */
  readonly #snapshot = linkedSignal<string, Snapshot>({
    source: this.#ids,
    computation: (ids, previous) => {
      if (previous?.value === "server") {
        return "server";
      }

      if (ids !== "" && ids === this.#initial) {
        return "server";
      }

      return "pending";
    },
  });

  /** @internal Every registration's IDs, or the static value when none names one. */
  protected readonly describedBy = computed(() => {
    const ids = this.#ids();
    // Read on every evaluation, so the snapshot sees every list of IDs the attribute renders.
    const snapshot = this.#snapshot();

    if (ids !== "") {
      return ids;
    }

    if (snapshot === "server") {
      return null;
    }

    return this.#initial;
  });

  /**
   * Adds a describer's IDs after those already registered, unless its view is already destroyed;
   * `destroyRef` removes them. Call from the describer's `ngOnInit`.
   * @param ids - Reactive IDs the describer names now; empty while it names none.
   * @param destroyRef - The describer's lifetime.
   */
  register(ids: () => readonly string[], destroyRef: DestroyRef): void {
    // A hook earlier in the describer's view can destroy that view before its `ngOnInit` runs.
    if (destroyRef.destroyed) {
      return;
    }

    const registration: Registration = { ids };

    this.#registrations.update((registrations) => [...registrations, registration]);
    destroyRef.onDestroy(() => {
      const remaining: Registration[] = [];

      for (const mounted of this.#registrations()) {
        if (mounted !== registration) {
          remaining.push(mounted);
        }
      }

      this.#registrations.set(remaining);
    });
  }
}
