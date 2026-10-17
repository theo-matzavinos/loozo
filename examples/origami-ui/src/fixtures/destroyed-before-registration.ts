import {
  Component,
  Directive,
  TemplateRef,
  ViewContainerRef,
  input,
  viewChild,
} from "@angular/core";
import type { OnInit } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";
import type { OrigamiCollectionRecord } from "@loozo/origami-ui/collection";
import { OrigamiRadioGroup, OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiTabs,
  OrigamiTabsList,
  OrigamiTabsPanel,
  OrigamiTabsTrigger,
} from "@loozo/origami-ui/tabs";
import {
  OrigamiCollapsible,
  OrigamiCollapsiblePanel,
  OrigamiCollapsibleTrigger,
} from "@loozo/origami-ui/collapsible";
import {
  OrigamiPopover,
  OrigamiPopoverAnchor,
  OrigamiPopoverContent,
  OrigamiPopoverTrigger,
} from "@loozo/origami-ui/popover";

// C5: a consumer hook earlier in an embedded view destroys that view before a later Origami
// part's ngOnInit, which Angular still runs. Each root stays outside the destroyed view, and a
// replacement then mounts under it.

/** Clears the outlet holding its own view, when given one, from its `ngOnInit`. */
@Directive({ selector: "[clearOnInit]" })
export class ClearOnInit implements OnInit {
  readonly outlet = input.required<ViewContainerRef | null>({ alias: "clearOnInit" });

  ngOnInit(): void {
    this.outlet()?.clear();
  }
}

type Part = {
  readonly template: TemplateRef<unknown>;
  readonly outlet: ViewContainerRef;
};

@Component({
  selector: "acceptance-destroyed-before-registration",
  imports: [
    ClearOnInit,
    OrigamiCollection,
    OrigamiCollectionItem,
    OrigamiRadioGroup,
    OrigamiRadioGroupItem,
    OrigamiTabs,
    OrigamiTabsList,
    OrigamiTabsTrigger,
    OrigamiTabsPanel,
    OrigamiCollapsible,
    OrigamiCollapsibleTrigger,
    OrigamiCollapsiblePanel,
    OrigamiPopover,
    OrigamiPopoverTrigger,
    OrigamiPopoverAnchor,
    OrigamiPopoverContent,
  ],
  template: `
    <h2>Parts destroyed before they register</h2>
    <button type="button" data-testid="unregistered-mount" (click)="mount()">
      Mount parts whose view is destroyed during initialization
    </button>
    <button type="button" data-testid="unregistered-remount" (click)="remount()">
      Mount replacement parts
    </button>

    <section ogCollection #collection="ogCollection">
      <ng-template #collectionPart let-outlet let-label="label">
        <i [clearOnInit]="outlet"></i>
        <span ogCollectionItem [value]="label">{{ label }}</span>
      </ng-template>
      <ng-container #collectionOutlet />
    </section>
    <output data-testid="unregistered-collection-items">{{
      values(collection.state.items())
    }}</output>

    <div ogRadioGroup value="gone" aria-label="Unregistered radio group">
      <ng-template #radioPart let-outlet let-label="label">
        <i [clearOnInit]="outlet"></i>
        <button ogRadioGroupItem [value]="label" [attr.data-testid]="'unregistered-radio-' + label">
          {{ label }}
        </button>
      </ng-template>
      <ng-container #radioOutlet />
    </div>

    <div ogTabs value="gone">
      <div ogTabsList aria-label="Unregistered tabs">
        <ng-template #tabsPart let-outlet let-label="label">
          <i [clearOnInit]="outlet"></i>
          <button
            ogTabsTrigger
            value="gone"
            [id]="'unregistered-' + label + '-tab'"
            [attr.data-testid]="'unregistered-tab-' + label"
          >
            {{ label }}
          </button>
        </ng-template>
        <ng-container #tabsOutlet />
      </div>
      <div
        ogTabsPanel
        value="gone"
        id="unregistered-tab-panel"
        data-testid="unregistered-tab-panel"
      >
        Panel
      </div>
    </div>

    <div ogCollapsible>
      <ng-template #collapsiblePart let-outlet let-label="label">
        <i [clearOnInit]="outlet"></i>
        <button
          ogCollapsibleTrigger
          [id]="'unregistered-' + label + '-collapsible-trigger'"
          [attr.data-testid]="'unregistered-collapsible-trigger-' + label"
        >
          {{ label }}
        </button>
      </ng-template>
      <ng-container #collapsibleOutlet />
      <div
        ogCollapsiblePanel
        id="unregistered-collapsible-panel"
        data-testid="unregistered-collapsible-panel"
      >
        Details
      </div>
    </div>

    <div ogPopover>
      <button
        ogPopoverTrigger
        ogPopoverAnchor
        id="unregistered-popover-trigger"
        data-testid="unregistered-popover-trigger"
      >
        Menu
      </button>
      <ng-template #popoverPart let-outlet let-label="label">
        <i [clearOnInit]="outlet"></i>
        <section ogPopoverContent [id]="'unregistered-' + label + '-popover-content'">
          {{ label }}
        </section>
      </ng-template>
      <ng-container #popoverOutlet />
    </div>
  `,
})
export class DestroyedBeforeRegistration {
  readonly collectionPart = viewChild.required("collectionPart", { read: TemplateRef });
  readonly collectionOutlet = viewChild.required("collectionOutlet", { read: ViewContainerRef });
  readonly radioPart = viewChild.required("radioPart", { read: TemplateRef });
  readonly radioOutlet = viewChild.required("radioOutlet", { read: ViewContainerRef });
  readonly tabsPart = viewChild.required("tabsPart", { read: TemplateRef });
  readonly tabsOutlet = viewChild.required("tabsOutlet", { read: ViewContainerRef });
  readonly collapsiblePart = viewChild.required("collapsiblePart", { read: TemplateRef });
  readonly collapsibleOutlet = viewChild.required("collapsibleOutlet", { read: ViewContainerRef });
  readonly popoverPart = viewChild.required("popoverPart", { read: TemplateRef });
  readonly popoverOutlet = viewChild.required("popoverOutlet", { read: ViewContainerRef });

  /** Each part's view clears its own outlet before the part's `ngOnInit`. */
  mount(): void {
    for (const part of this.#parts()) {
      part.outlet.createEmbeddedView(part.template, { $implicit: part.outlet, label: "gone" });
    }
  }

  /** Replacements under the same roots, which nothing destroys. */
  remount(): void {
    for (const part of this.#parts()) {
      part.outlet.createEmbeddedView(part.template, { $implicit: null, label: "kept" });
    }
  }

  values(records: readonly OrigamiCollectionRecord[]): string {
    const values: string[] = [];

    for (const record of records) {
      values.push(record.value());
    }

    return values.join(",");
  }

  #parts(): readonly Part[] {
    return [
      { template: this.collectionPart(), outlet: this.collectionOutlet() },
      { template: this.radioPart(), outlet: this.radioOutlet() },
      { template: this.tabsPart(), outlet: this.tabsOutlet() },
      { template: this.collapsiblePart(), outlet: this.collapsibleOutlet() },
      { template: this.popoverPart(), outlet: this.popoverOutlet() },
    ];
  }
}
