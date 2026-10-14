import { Component } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";
import { OrigamiCollapsible } from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";

// SSR-only construction failures rendered by tests/acceptance/ssr-checks.mjs; never routed.

@Component({
  selector: "error-app",
  imports: [OrigamiCollectionItem],
  template: `<div ogCollectionItem></div>`,
})
export class OrphanCollection {}

@Component({
  selector: "error-app",
  imports: [OrigamiCollection, OrigamiAccordionItem],
  template: `<div ogCollection><div ogAccordionItem></div></div>`,
})
export class OrphanAccordion {}

@Component({
  selector: "error-app",
  imports: [OrigamiCollapsible, OrigamiAccordionPanel],
  template: `<div ogCollapsible><div ogAccordionPanel></div></div>`,
})
export class OrphanAccordionPanel {}

@Component({
  selector: "error-app",
  imports: [OrigamiAccordionSingle, OrigamiAccordionItem, OrigamiAccordionTrigger],
  template: `<div ogAccordionSingle>
    <div ogAccordionItem>
      <button ogAccordionTrigger>One</button><button ogAccordionTrigger>Two</button>
    </div>
  </div>`,
})
export class DuplicateTrigger {}

@Component({
  selector: "error-app",
  imports: [OrigamiAccordionSingle, OrigamiAccordionItem, OrigamiAccordionPanel],
  template: `<div ogAccordionSingle>
    <div ogAccordionItem>
      <div ogAccordionPanel>One</div>
      <div ogAccordionPanel>Two</div>
    </div>
  </div>`,
})
export class DuplicatePanel {}
