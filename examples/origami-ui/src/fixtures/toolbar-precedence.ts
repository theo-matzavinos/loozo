import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarOptions,
  OrigamiToolbarState,
  OrigamiToolbarItem,
  OrigamiToolbarItemOptions,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";

// K5 precedence: whole replacement Options win over conflicting direct inputs in both directive
// import orders, with a factory for the root and an existing provider for the item. Both cases
// share one template; only the import (registry) order differs.

@Service({ autoProvided: false })
export class ToolbarPrecedenceSettings {
  readonly orientation = signal<OrigamiToolbarOrientation>("vertical");
  readonly disabled = signal(true);
}

@Directive({
  selector: "[precedenceFactoryToolbar]",
  exportAs: "precedenceFactoryToolbar",
  hostDirectives: [OrigamiToolbar],
  providers: [
    OrigamiToolbarOptions.provideFactory(() => ({
      orientation: inject(ToolbarPrecedenceSettings).orientation,
    })),
  ],
})
export class PrecedenceFactoryToolbar {
  readonly state = inject(OrigamiToolbarState);
}

@Directive({
  selector: "button[precedenceExistingToolbarItem]",
  hostDirectives: [OrigamiToolbarItem],
  providers: [OrigamiToolbarItemOptions.provideExisting(() => PrecedenceExistingToolbarItem)],
})
export class PrecedenceExistingToolbarItem implements OrigamiToolbarItemOptions {
  readonly disabled = inject(ToolbarPrecedenceSettings).disabled;
}

// Direct inputs deliberately contradict the replacement. One return statement keeps the template
// statically evaluable by the Angular compiler.
const template = `
  <div precedenceFactoryToolbar ogToolbar #upper="precedenceFactoryToolbar" orientation="horizontal"
    aria-label="Toolbar precedence" data-role="root">
    <button ogToolbarItem data-role="first">First</button>
    <button precedenceExistingToolbarItem ogToolbarItem [disabled]="false" data-role="replaced">
      Replaced
    </button>
    <button ogToolbarItem data-role="last">Last</button>
  </div>
  <output data-role="orientation">{{ upper.state.orientation() }}</output>
  <button type="button" data-role="enable" (click)="settings.disabled.set(!settings.disabled())">
    Toggle replaced disabled
  </button>
  <button type="button" data-role="horizontal" (click)="settings.orientation.set('horizontal')">
    Horizontal
  </button>
`;

abstract class ToolbarPrecedenceCase {
  readonly settings = inject(ToolbarPrecedenceSettings);
}

@Component({
  selector: "toolbar-precedence-upper-first",
  imports: [
    PrecedenceFactoryToolbar,
    OrigamiToolbar,
    PrecedenceExistingToolbarItem,
    OrigamiToolbarItem,
  ],
  providers: [ToolbarPrecedenceSettings],
  host: { "data-toolbar-case": "upper-first" },
  template,
})
export class ToolbarUpperFirst extends ToolbarPrecedenceCase {}

@Component({
  selector: "toolbar-precedence-lower-first",
  imports: [
    OrigamiToolbar,
    PrecedenceFactoryToolbar,
    OrigamiToolbarItem,
    PrecedenceExistingToolbarItem,
  ],
  providers: [ToolbarPrecedenceSettings],
  host: { "data-toolbar-case": "lower-first" },
  template,
})
export class ToolbarLowerFirst extends ToolbarPrecedenceCase {}

@Component({
  selector: "acceptance-toolbar-precedence",
  imports: [ToolbarUpperFirst, ToolbarLowerFirst],
  template: `
    <h2>Toolbar replacement precedence</h2>
    <toolbar-precedence-upper-first />
    <toolbar-precedence-lower-first />
  `,
})
export class ToolbarPrecedence {}
