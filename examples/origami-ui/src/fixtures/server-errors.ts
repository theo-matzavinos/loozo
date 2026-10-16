import { Component } from "@angular/core";
import { OrigamiCollection, OrigamiCollectionItem } from "@loozo/origami-ui/collection";
import { OrigamiCollapsible } from "@loozo/origami-ui/collapsible";
import {
  OrigamiAccordionSingle,
  OrigamiAccordionItem,
  OrigamiAccordionTrigger,
  OrigamiAccordionPanel,
} from "@loozo/origami-ui/accordion";
import { OrigamiToggleGroupItem } from "@loozo/origami-ui/toggle-group";
import { OrigamiRadioGroupItem } from "@loozo/origami-ui/radio-group";
import {
  OrigamiToolbarRadioGroup,
  OrigamiToolbarToggleGroupMultiple,
  OrigamiToolbarToggleGroupSingle,
} from "@loozo/origami-ui/toolbar";

// SSR-only construction and publish failures rendered by tests/acceptance/ssr-checks.mjs; never routed.

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

@Component({
  selector: "error-app",
  imports: [OrigamiToolbarToggleGroupSingle, OrigamiToggleGroupItem],
  template: `<div ogToolbarToggleGroupSingle><button ogToggleGroupItem value="a">A</button></div>`,
})
export class OrphanToolbarToggleGroupSingle {}

@Component({
  selector: "error-app",
  imports: [OrigamiToolbarToggleGroupMultiple, OrigamiToggleGroupItem],
  template: `<div ogToolbarToggleGroupMultiple>
    <button ogToggleGroupItem value="a">A</button>
  </div>`,
})
export class OrphanToolbarToggleGroupMultiple {}

@Component({
  selector: "error-app",
  imports: [OrigamiToolbarRadioGroup, OrigamiRadioGroupItem],
  template: `<div ogToolbarRadioGroup><button ogRadioGroupItem value="a">A</button></div>`,
})
export class OrphanToolbarRadioGroup {}
