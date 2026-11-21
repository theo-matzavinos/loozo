import { Component, computed, inject, input } from "@angular/core";
import {
  LucideCircleCheck,
  LucideCircleX,
  LucideInfo,
  LucideTriangleAlert,
  LucideX,
} from "@lucide/angular";
import { OrigamiToast, OrigamiToastRegion } from "@loozo/origami-ui/toast";
import { Button } from "../button";
import { cn } from "../cn";
import { popupClasses } from "../popup";
import { ToastClose } from "./toast-close";
import { Toasts, type ToastData } from "./toasts";

/**
 * Shows the app's `Toasts` in the bottom-end corner, once, in the root component. A collapsed
 * deck: the newest card in front, older cards peeking 8px above it at its one-line height. Hover
 * or focus inside fans the deck into a column with the newest at the bottom, scrolling within the
 * viewport when it is taller. Named by `label`, each Close by `closeLabel`; `duration` and
 * `limit` are the region's defaults.
 */
@Component({
  selector: "[fold__ToastRegion]",
  imports: [
    OrigamiToastRegion,
    OrigamiToast,
    ToastClose,
    Button,
    LucideCircleCheck,
    LucideCircleX,
    LucideInfo,
    LucideTriangleAlert,
    LucideX,
  ],
  host: { "data-slot": "toast-region", "[class]": "classes()" },
  template: `
    <section
      [ogToastRegion]="toasts"
      [duration]="duration()"
      [limit]="limit()"
      #region="ogToastRegion"
      [attr.aria-label]="label()"
      class="outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <!-- role="list" keeps the list role Safari drops from a list without markers. -->
      <ol role="list" data-slot="toast-list" [class]="listClasses">
        @for (toast of region.state.toasts(); track toast.id; let index = $index) {
          <li
            [ogToast]="toast"
            data-slot="toast"
            [class]="toastClasses"
            [attr.data-kind]="toast.data.kind"
            [style.--toast-index]="index"
          >
            @switch (toast.data.kind) {
              @case ("success") {
                <svg
                  lucideCircleCheck
                  data-slot="toast-icon"
                  class="mt-2 size-4 shrink-0 text-success"
                  aria-hidden="true"
                ></svg>
              }
              @case ("warning") {
                <svg
                  lucideTriangleAlert
                  data-slot="toast-icon"
                  class="mt-2 size-4 shrink-0 text-warning"
                  aria-hidden="true"
                ></svg>
              }
              @case ("error") {
                <svg
                  lucideCircleX
                  data-slot="toast-icon"
                  class="mt-2 size-4 shrink-0 text-destructive-text"
                  aria-hidden="true"
                ></svg>
              }
              @case ("info") {
                <svg
                  lucideInfo
                  data-slot="toast-icon"
                  class="mt-2 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                ></svg>
              }
            }
            <div class="min-w-0 flex-1 pt-1.5">
              <p data-slot="toast-title" class="font-semibold [overflow-wrap:anywhere]">
                {{ toast.data.title }}
              </p>
              @if (toast.data.description) {
                <p
                  data-slot="toast-description"
                  class="mt-1 text-muted-foreground [overflow-wrap:anywhere]"
                >
                  {{ toast.data.description }}
                </p>
              }
              @if (toast.data.action; as action) {
                <!-- A long label wraps inside the card instead of widening it. -->
                <button
                  fold__Button
                  size="sm"
                  class="mt-2 h-auto min-h-7 max-w-full py-1 text-start whitespace-normal [overflow-wrap:anywhere]"
                  (click)="act(action, toast.id)"
                >
                  {{ action.label }}
                </button>
              }
            </div>
            <button fold__ToastClose variant="ghost" size="icon" [attr.aria-label]="closeLabel()">
              <svg lucideX aria-hidden="true"></svg>
            </button>
          </li>
        }
      </ol>
    </section>
  `,
})
export class ToastRegion {
  readonly label = input("Notifications");
  readonly closeLabel = input("Close");
  readonly duration = input(5000);
  readonly limit = input(3);
  readonly class = input("");

  protected readonly toasts = inject(Toasts);

  protected readonly classes = computed(() =>
    cn(
      // --toast-collapsed is a one-line toast's height: 12px padding, the 32px Close, 12px
      // padding and the 2px border. Keep the 8px peek inside the 12px top padding, so no back
      // card's control sits under a peek.
      "group/toasts fixed bottom-5 end-5 z-50 block w-[min(24rem,calc(100vw_-_2.5rem))] [--toast-collapsed:58px] [interpolate-size:allow-keywords]",
      // Expanded, the list's scroller ends at the region's bottom and clips the newest card's
      // shadow there. This box paints that shadow below the region instead, and nothing else, only
      // while a card that isn't leaving is shown: focus can rest on the empty region.
      "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:hidden after:h-(--toast-collapsed) after:rounded-menu after:shadow-popover after:[clip-path:inset(100%_-2rem_-2rem)]",
      "has-[[data-slot=toast]:not([data-leaving])]:hover:after:block has-[[data-slot=toast]:not([data-leaving])]:focus-within:after:block",
      this.class(),
    ),
  );

  // One column, never wider than the region. Expanded, the list scrolls within the viewport less
  // the region's 20px insets, so a scrolled card never covers the page in them: a column-reverse
  // scroller starts at its end, so the newest card shows first, and focus scrolls an older control
  // into view, 12px in from the edge with its ring. The inline 2rem padding and the top 1rem, each
  // taken back by a negative margin, keep the cards' shadows unclipped at the sides and above;
  // below, the scroller ends at the newest card. The list itself takes no pointer, so that padding
  // doesn't cover the page; the cards do, and the section's box covers the gaps between them. No
  // scrollbar, so the cards keep the region's width.
  protected readonly listClasses = cn(
    "pointer-events-none isolate grid grid-cols-1 [scrollbar-width:none]",
    "group-hover/toasts:flex group-hover/toasts:flex-col-reverse group-hover/toasts:gap-2",
    "group-hover/toasts:-mx-8 group-hover/toasts:px-8 group-hover/toasts:-mt-4 group-hover/toasts:pt-4",
    "group-hover/toasts:max-h-[calc(100dvh_-_2.5rem)] group-hover/toasts:overflow-y-auto group-hover/toasts:scroll-py-3",
    "group-focus-within/toasts:flex group-focus-within/toasts:flex-col-reverse group-focus-within/toasts:gap-2",
    "group-focus-within/toasts:-mx-8 group-focus-within/toasts:px-8 group-focus-within/toasts:-mt-4 group-focus-within/toasts:pt-4",
    "group-focus-within/toasts:max-h-[calc(100dvh_-_2.5rem)] group-focus-within/toasts:overflow-y-auto group-focus-within/toasts:scroll-py-3",
  );

  // Origami lists the newest first, so `first` is the front card. Older cards stack behind it,
  // clamped to the collapsed height with their content transparent but still read. Hover fans
  // the deck out; focus inside snaps it open, with no transition, so a focused control shows at once.
  protected readonly toastClasses = cn(
    popupClasses,
    "pointer-events-auto [grid-area:1/1] self-start w-full shrink-0 flex items-start gap-2 p-3 min-h-(--toast-collapsed)",
    "z-[calc(var(--toast-index)*-1)] origin-top",
    "translate-y-[calc(var(--toast-index)*-8px)] scale-[calc(1-var(--toast-index)*0.035)]",
    "transition-[height,translate,scale] duration-180 ease-out motion-reduce:transition-none",
    "not-first:h-(--toast-collapsed) not-first:overflow-hidden not-first:*:opacity-0",
    "group-hover/toasts:h-auto group-hover/toasts:translate-y-0 group-hover/toasts:scale-100 group-hover/toasts:*:opacity-100",
    "group-focus-within/toasts:h-auto group-focus-within/toasts:translate-y-0 group-focus-within/toasts:scale-100 group-focus-within/toasts:*:opacity-100",
    "group-focus-within/toasts:transition-none",
  );

  protected act(action: NonNullable<ToastData["action"]>, id: string): void {
    action.run();
    this.toasts.close(id);
  }
}
