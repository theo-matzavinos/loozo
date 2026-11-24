import { Directive, computed, input } from "@angular/core";
import { cn } from "../cn";

/**
 * A titled page frame on an element you write: a 20px-padded column with a PageHeader and the
 * content. fold sets no landmark, role or name: `<main fold__Page>` needs none, and a
 * `<section fold__Page>` stays a plain section unless you name it. In a shell that already pads its
 * outlet, write `class="p-0"`.
 *
 * @example
 * ```html
 * <main fold__Page>
 *   <header fold__PageHeader>
 *     <div>
 *       <h1 fold__PageTitle>Budgets</h1>
 *       <p fold__PageDescription>Acme Ltd · fiscal year 2026</p>
 *     </div>
 *     <div fold__PageActions><button fold__Button variant="primary">New budget</button></div>
 *   </header>
 * </main>
 * ```
 */
@Directive({
  selector: "[fold__Page]",
  host: { "data-slot": "page", "[class]": "classes()" },
})
export class Page {
  readonly class = input("");

  protected readonly classes = computed(() => cn("flex min-w-0 flex-col gap-5 p-5", this.class()));
}
