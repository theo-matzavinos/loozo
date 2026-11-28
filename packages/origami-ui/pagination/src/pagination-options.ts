import { forwardRef } from "@angular/core";
import type { AbstractType, Provider, Signal, Type, WritableSignal } from "@angular/core";

/** Effective Pagination configuration, replaced as a whole rather than merged with unused defaults. */
export abstract class OrigamiPaginationOptions {
  /**
   * The requested page, from 1; direct default 1. It is never corrected: a page outside the pages,
   * fractional or not finite marks and steps from the effective page (floored, clamped to the
   * pages, 1 when not finite) while State's `from` and `to` report the requested page's items. A
   * page item or step activation writes its target here, at most once, unless the target is
   * `===` this value; nothing else writes it.
   */
  abstract readonly page: WritableSignal<number>;
  /**
   * The item total, required on the directive: floored when finite and at least 0, at most
   * `Number.MAX_SAFE_INTEGER`; anything else counts as 0, which means no pages.
   */
  abstract readonly total: Signal<number>;
  /**
   * The items per page, required on the directive: floored when finite and at least 1; anything
   * else counts as 1.
   */
  abstract readonly pageSize: Signal<number>;
  /**
   * The pages shown on each side of the current page in the range; direct default 1. Floored; a
   * negative count is 0 and one that isn't finite is 1.
   */
  abstract readonly siblings: Signal<number>;
  /**
   * The pages always shown at each end of the range; direct default 1. Floored; a negative count
   * is 0 and one that isn't finite is 1.
   */
  abstract readonly boundaries: Signal<number>;

  /**
   * Replaces Pagination Options with an existing compatible concrete or abstract provider.
   * @param type - Supplier of a compatible concrete or abstract provider class, allowing forward
   *   references and host-directive composition.
   * @returns A local provider.
   */
  static provideExisting(
    type: () => Type<OrigamiPaginationOptions> | AbstractType<OrigamiPaginationOptions>,
  ): Provider {
    return { provide: OrigamiPaginationOptions, useExisting: forwardRef(type) };
  }

  /**
   * Replaces all Pagination Options with a structurally compatible result, without merging unused
   * directive defaults.
   * @param factory - Executes in Angular injection context; supply `page`, `total`, `pageSize`,
   *   `siblings` and `boundaries`. Its signals are first read by whichever comes first, a State
   *   read or a part's host bindings, which run in the first change detection at the latest, so
   *   they must hold their values by then. `page` may be a plain writable signal: writing it emits
   *   nothing from the unused directive's `pageChange`.
   * @returns A local provider.
   */
  static provideFactory(factory: () => OrigamiPaginationOptions): Provider {
    return { provide: OrigamiPaginationOptions, useFactory: factory };
  }
}
