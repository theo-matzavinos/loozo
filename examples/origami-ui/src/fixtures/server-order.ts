import {
  Component,
  Directive,
  ElementRef,
  PendingTasks,
  Service,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";
import type { OrigamiCollectionRecord } from "@loozo/origami-ui/collection";
import { OrigamiAccordionMultiple, OrigamiAccordionItem } from "@loozo/origami-ui/accordion";

// SSR-only consumers rendered by tests/acceptance/ssr-checks.mjs; never imported by browser routes.

/** Per-render proof evidence; observes actual nodes and public State, never private registration. */
@Service({ autoProvided: false })
export class ServerOrderEvidence {
  initialValues: readonly string[] = [];
  finalValues: readonly string[] = [];
  finalCollectionValues: readonly string[] = [];
  initialParents: readonly (Node | null)[] = [];
  observeFinal = (): void => {};
  initialNodes: readonly Element[] = [];
  finalNodes: readonly Element[] = [];
  initialRecords: readonly OrigamiCollectionRecord[] = [];
  retained = false;
  /** Whether the final `items` read returned the initial array: a keyed move notified no reader. */
  sameItems = false;
  observations = 0;
}

/**
 * Genuine pending-task keyed move after the first public State read and rendered-node capture.
 * Membership doesn't change, so `items` and `itemValues` keep their order.
 */
@Component({
  selector: "order-app",
  imports: [
    OrigamiCollection,
    OrigamiCollectionItem,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
  ],
  template: `
    <section ogCollection #collection="ogCollection">
      @for (key of keys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-server-item]="key">{{ key }}</span>
      }
      <output id="server-collection-order">{{ collection.state.items()[0]?.value() }},{{ collection.state.items()[1]?.value() }}</output>
    </section>
    <section ogAccordionMultiple #accordion="ogAccordionMultiple">
      @for (key of keys(); track key) {
        <article ogAccordionItem [value]="key" [attr.data-server-accordion-item]="key">{{ key }}</article>
      }
      <output id="server-accordion-order">{{ accordion.state.itemValues().join(',') }}</output>
    </section>
  `,
})
export class ServerOrderConsumer {
  readonly keys = signal(["one", "two"]);
  protected readonly collectionView = viewChild.required(OrigamiCollection);
  protected readonly accordionView = viewChild.required(OrigamiAccordionMultiple);
  readonly #host = inject<ElementRef<Element>>(ElementRef).nativeElement;
  readonly #evidence = inject(ServerOrderEvidence);
  #releaseInitial: () => void = () => {};

  constructor() {
    this.#evidence.observeFinal = () => this.#recordFinal();

    const initialRender = new Promise<void>((resolve) => {
      this.#releaseInitial = resolve;
    });

    inject(PendingTasks).run(async () => {
      await initialRender;
      this.keys.set(["two", "one"]);
    });
  }

  ngAfterViewChecked(): void {
    const evidence = this.#evidence;
    const records = this.collectionView().state.items();
    const values: string[] = [];

    for (const record of records) {
      values.push(record.value());
    }

    evidence.observations += 1;

    if (evidence.initialNodes.length === 0) {
      evidence.initialNodes = Array.from(
        this.#host.querySelectorAll("[data-server-item], [data-server-accordion-item]"),
      );
      evidence.initialValues = values;
      evidence.initialRecords = records;
      evidence.initialParents = evidence.initialNodes.map((node) => node.parentNode);
      this.#releaseInitial();

      return;
    }
  }

  #recordFinal(): void {
    const evidence = this.#evidence;
    const records = this.collectionView().state.items();
    const values: string[] = [];

    for (const record of records) {
      values.push(record.value());
    }

    evidence.observations += 1;
    evidence.finalNodes = Array.from(
      this.#host.querySelectorAll("[data-server-item], [data-server-accordion-item]"),
    );
    evidence.finalValues = this.accordionView().state.itemValues();
    evidence.finalCollectionValues = values;
    evidence.retained =
      evidence.initialNodes.length === evidence.finalNodes.length &&
      evidence.initialNodes.every(
        (node, index) =>
          evidence.finalNodes.includes(node) && node.parentNode === evidence.initialParents[index],
      ) &&
      evidence.initialRecords.length === records.length &&
      evidence.initialRecords.every((record) => records.includes(record));
    evidence.sameItems = records === evidence.initialRecords;
  }
}

/** Evidence for a Collection and an Accordion whose order is first read after unread renders. */
@Service({ autoProvided: false })
export class ServerLateOrderEvidence {
  firstCollection: readonly string[] = [];
  firstAccordion: readonly string[] = [];
  movedCollection: readonly string[] = [];
  movedAccordion: readonly string[] = [];
  finalCollection: readonly string[] = [];
  finalAccordion: readonly string[] = [];
  finalNodes: readonly Element[] = [];
  observeFinal = (): void => {};
}

/** Reports each check of its declaring view; targeted refreshes skip the root component's own hooks. */
@Directive({ selector: "[lateOrderChecked]" })
export class LateOrderChecked {
  readonly #consumer = inject(ServerLateOrderConsumer);

  ngAfterViewChecked(): void {
    this.#consumer.checked();
  }
}

/**
 * Pending-task keyed moves and an insertion render while no State is read; the first reads follow
 * those renders. A further keyed move keeps the read order; a later removal reads DOM order again.
 */
@Component({
  selector: "late-order-app",
  imports: [
    LateOrderChecked,
    OrigamiCollection,
    OrigamiCollectionItem,
    OrigamiAccordionMultiple,
    OrigamiAccordionItem,
  ],
  template: `
    <section ogCollection lateOrderChecked>
      @for (key of keys(); track key) {
        <span ogCollectionItem [value]="key" [attr.data-server-item]="key">{{ key }}</span>
      }
    </section>
    <section ogAccordionMultiple>
      @for (key of keys(); track key) {
        <article ogAccordionItem [value]="key" [attr.data-server-accordion-item]="key">
          {{ key }}
        </article>
      }
    </section>
  `,
})
export class ServerLateOrderConsumer {
  readonly keys = signal(["one", "two"]);
  protected readonly collectionView = viewChild.required(OrigamiCollection);
  protected readonly accordionView = viewChild.required(OrigamiAccordionMultiple);
  readonly #host = inject<ElementRef<Element>>(ElementRef).nativeElement;
  readonly #evidence = inject(ServerLateOrderEvidence);
  checked: () => void = () => {};

  constructor() {
    this.#evidence.observeFinal = () => {
      this.#evidence.finalCollection = this.#collectionValues();
      this.#evidence.finalAccordion = this.accordionView().state.itemValues();
      this.#evidence.finalNodes = Array.from(
        this.#host.querySelectorAll("[data-server-item], [data-server-accordion-item]"),
      );
    };

    inject(PendingTasks).run(async () => {
      await this.#nextCheck();
      this.keys.set(["two", "one"]);
      await this.#nextCheck();
      this.keys.set(["three", "two", "one"]);
      await this.#nextCheck();
      this.#evidence.firstCollection = this.#collectionValues();
      this.#evidence.firstAccordion = this.accordionView().state.itemValues();
      this.keys.set(["one", "three", "two"]);
      await this.#nextCheck();
      this.#evidence.movedCollection = this.#collectionValues();
      this.#evidence.movedAccordion = this.accordionView().state.itemValues();
      this.keys.set(["one", "two"]);
    });
  }

  #nextCheck(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.checked = resolve;
    });
  }

  #collectionValues(): string[] {
    const values: string[] = [];

    for (const record of this.collectionView().state.items()) {
      values.push(record.value());
    }

    return values;
  }
}
