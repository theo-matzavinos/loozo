import {
  type EmbeddedViewRef,
  Injector,
  TemplateRef,
  ViewContainerRef,
  effect,
  inject,
  untracked,
} from "@angular/core";
import { UiSdkError } from "./error";
import type { ɵUiSdkSlot } from "./slot";

/**
 * Renders a structural part directive's template while core has its part in the page, and hands
 * the template's one root element to the part's slot. Core decides presence (open, exiting, kept
 * or findable); this only follows `slot.present()`.
 */
export class ɵUiSdkPresence {
  readonly #slot: ɵUiSdkSlot<object>;
  readonly #directive: string;
  readonly #template: TemplateRef<unknown>;
  readonly #container = inject(ViewContainerRef);
  #view: EmbeddedViewRef<unknown> | null = null;

  constructor(slot: ɵUiSdkSlot<object>, directive: string) {
    const template = inject<TemplateRef<unknown>>(TemplateRef, { optional: true });

    if (template === null) {
      throw new UiSdkError(
        `${directive} goes on the panel's element with *: <div *${directive}>…</div>.`,
      );
    }

    this.#slot = slot;
    this.#directive = directive;
    this.#template = template;

    // Later presence changes. Its first run comes after the directive's `ngOnInit`, which already
    // synced, so it changes nothing.
    effect(
      () => {
        slot.present();
        untracked(() => this.sync());
      },
      { injector: inject(Injector) },
    );
  }

  /**
   * Creates or destroys the view to match `slot.present()`. The directive calls it from
   * `ngOnInit`, once its inputs and its root's are set; an effect calls it on every later change.
   */
  sync(): void {
    const present = this.#slot.present();

    if (!present) {
      this.#remove();

      return;
    }

    if (this.#view !== null) {
      return;
    }

    const view = this.#container.createEmbeddedView(this.#template);
    const element = onlyElement(view.rootNodes as Node[]);

    if (element === undefined) {
      // Checked in every build: a panel whose siblings render outside it would leave them in the
      // page while core thinks the panel is closed.
      view.destroy();

      throw new UiSdkError(
        `${this.#directive} renders exactly one element, the panel: put everything else inside it. ` +
          `Write <div *${this.#directive}>…</div>, or <ng-template ${this.#directive} keepMounted><div>…</div></ng-template>.`,
      );
    }

    this.#view = view;
    this.#slot.mount(element);
  }

  #remove(): void {
    const view = this.#view;

    if (view === null) {
      return;
    }

    this.#view = null;
    this.#slot.unmount();
    view.destroy();
  }
}

// Node types by number: the server's DOM doesn't define a global `Node`.
const elementNode = 1;
const textNode = 3;
const commentNode = 8;

/**
 * The template's one element, skipping comments and whitespace-only text; undefined when there's
 * no element, more than one, or other text. Only the nodes at creation are checked: a top-level
 * `@if` or `@for` that renders later isn't.
 */
function onlyElement(nodes: readonly Node[]): HTMLElement | undefined {
  let element: HTMLElement | undefined;

  for (const node of nodes) {
    if (node.nodeType === commentNode) {
      continue;
    }

    if (node.nodeType === textNode && node.textContent?.trim() === "") {
      continue;
    }

    if (node.nodeType !== elementNode || element !== undefined) {
      return undefined;
    }

    element = node as HTMLElement;
  }

  return element;
}

/**
 * Creates the presence helper for a structural part directive: `slot` is its part's slot, made
 * with `mounts`, and `directive` names it in errors, like `uiCollapsiblePanel`.
 */
export function ɵinjectPresence(slot: ɵUiSdkSlot<object>, directive: string): ɵUiSdkPresence {
  return new ɵUiSdkPresence(slot, directive);
}
