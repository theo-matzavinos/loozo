import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  PendingTasks,
  Service,
  inject,
  signal,
  viewChild,
} from "@angular/core";
import {
  OrigamiCollection,
  OrigamiCollectionItem,
  OrigamiCollectionState,
} from "@loozo/origami-ui/collection";
import type { OrigamiCollectionRecord } from "@loozo/origami-ui/collection";
import {
  OrigamiAccordionMultiple,
  OrigamiAccordionItem,
  OrigamiAccordionState,
} from "@loozo/origami-ui/accordion";

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
  observations = 0;
  ownerChecks = 0;
  finalReads: readonly {
    collection: readonly string[];
    accordion: readonly string[];
  }[] = [];
}

/** Genuine pending-task async key move after the first public State read and rendered-node capture. */
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
  }
}

/** Only this OnPush descendant owns the keyed Collection item views and their State output. */
@Component({
  selector: "server-collection-descendant",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrigamiCollectionItem],
  template: `
    @for (key of keys(); track key) {
      <span ogCollectionItem [value]="key" [attr.data-server-item]="key">{{ key }}</span>
    }
    <output id="onpush-collection-order">{{ state.items()[0]?.value() }},{{ state.items()[1]?.value() }}</output>
  `,
})
export class ServerCollectionDescendant {
  readonly keys = signal(["one", "two"]);
  readonly state = inject(OrigamiCollectionState);
}

/** Accordion composes the Collection Item hook in the descendant's own keyed embedded views. */
@Component({
  selector: "server-accordion-descendant",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OrigamiAccordionItem],
  template: `
    @for (key of keys(); track key) {
      <article ogAccordionItem [value]="key" [attr.data-server-accordion-item]="key">{{ key }}</article>
    }
    <output id="onpush-accordion-order">{{ state.itemValues().join(',') }}</output>
  `,
})
export class ServerAccordionDescendant {
  readonly keys = signal(["one", "two"]);
  readonly state = inject(OrigamiAccordionState);
}

/**
 * Static OnPush owner views are only traversed after their OnPush children change keys.
 * State capture occurs in lifecycle/final serialization callbacks, not owner template bindings;
 * no markForCheck, detectChanges or owner signal write can conceal skipped owner hooks.
 */
@Component({
  selector: "onpush-order-app",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    OrigamiCollection,
    OrigamiAccordionMultiple,
    ServerCollectionDescendant,
    ServerAccordionDescendant,
  ],
  template: `
    <section ogCollection>
      <server-collection-descendant />
    </section>
    <section ogAccordionMultiple>
      <server-accordion-descendant />
    </section>
  `,
})
export class ServerOnPushOrderConsumer {
  protected readonly collectionView = viewChild.required(OrigamiCollection);
  protected readonly accordionView = viewChild.required(OrigamiAccordionMultiple);
  protected readonly collectionChild = viewChild.required(ServerCollectionDescendant);
  protected readonly accordionChild = viewChild.required(ServerAccordionDescendant);
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
      this.collectionChild().keys.set(["two", "one"]);
      this.accordionChild().keys.set(["two", "one"]);
    });
  }

  ngAfterViewChecked(): void {
    const evidence = this.#evidence;

    evidence.ownerChecks += 1;

    if (evidence.initialNodes.length !== 0) {
      return;
    }

    const records = this.collectionView().state.items();
    const values: string[] = [];

    for (const record of records) {
      values.push(record.value());
    }

    // Prime both public computed signals before either descendant changes keys.
    this.accordionView().state.itemValues();
    evidence.initialValues = values;
    evidence.initialRecords = records;
    evidence.initialNodes = Array.from(
      this.#host.querySelectorAll("[data-server-item], [data-server-accordion-item]"),
    );
    evidence.initialParents = evidence.initialNodes.map((node) => node.parentNode);
    evidence.observations += 1;
    this.#releaseInitial();
  }

  #recordFinal(): void {
    const evidence = this.#evidence;
    const reads: { collection: readonly string[]; accordion: readonly string[] }[] = [];

    // Consecutive reads must stay current, without any requested render between them.
    for (let index = 0; index < 3; index += 1) {
      const values: string[] = [];

      for (const record of this.collectionView().state.items()) {
        values.push(record.value());
      }

      reads.push({
        collection: values,
        accordion: this.accordionView().state.itemValues(),
      });
    }

    const records = this.collectionView().state.items();

    evidence.finalReads = reads;
    evidence.finalCollectionValues = reads[0].collection;
    evidence.finalValues = reads[0].accordion;
    evidence.finalNodes = Array.from(
      this.#host.querySelectorAll("[data-server-item], [data-server-accordion-item]"),
    );
    evidence.retained =
      evidence.initialNodes.length === evidence.finalNodes.length &&
      evidence.initialNodes.every(
        (node, index) =>
          evidence.finalNodes.includes(node) && node.parentNode === evidence.initialParents[index],
      ) &&
      evidence.initialRecords.length === records.length &&
      evidence.initialRecords.every((record) => records.includes(record));
    evidence.observations += 1;
  }
}
