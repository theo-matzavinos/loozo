import { Component, Directive, Service, inject, signal } from "@angular/core";
import {
  OrigamiToolbar,
  OrigamiToolbarOptions,
  OrigamiToolbarState,
  OrigamiToolbarItem,
  type OrigamiToolbarOrientation,
} from "@loozo/origami-ui/toolbar";
import { OrigamiButtonOptions } from "@loozo/origami-ui/button";

// K5 precedence: whole replacement Options win over the composed directives' own inputs, bound
// through the consumers' exposed host-directive inputs, with a factory for the root and an
// existing provider for the item.

@Service({ autoProvided: false })
export class ToolbarPrecedenceSettings {
  readonly orientation = signal<OrigamiToolbarOrientation>("vertical");
  readonly disabled = signal(true);
}

@Directive({
  selector: "[precedenceFactoryToolbar]",
  exportAs: "precedenceFactoryToolbar",
  hostDirectives: [{ directive: OrigamiToolbar, inputs: ["orientation"] }],
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
  hostDirectives: [{ directive: OrigamiToolbarItem, inputs: ["disabled"] }],
  providers: [OrigamiButtonOptions.provideExisting(() => PrecedenceExistingToolbarItem)],
})
export class PrecedenceExistingToolbarItem implements OrigamiButtonOptions {
  readonly disabled = inject(ToolbarPrecedenceSettings).disabled;
  readonly focusableWhenDisabled = signal(false);
}

// The composed directives' own inputs deliberately contradict the replacement.
const template = `
  <h2>Toolbar replacement precedence</h2>
  <div precedenceFactoryToolbar #consumer="precedenceFactoryToolbar" orientation="horizontal"
    aria-label="Toolbar precedence" data-role="root">
    <button ogToolbarItem data-role="first">First</button>
    <button precedenceExistingToolbarItem [disabled]="false" data-role="replaced">
      Replaced
    </button>
    <button ogToolbarItem data-role="last">Last</button>
  </div>
  <output data-role="orientation">{{ consumer.state.orientation() }}</output>
  <button type="button" data-role="enable" (click)="settings.disabled.set(!settings.disabled())">
    Toggle replaced disabled
  </button>
  <button type="button" data-role="horizontal" (click)="settings.orientation.set('horizontal')">
    Horizontal
  </button>
`;

@Component({
  selector: "acceptance-toolbar-precedence",
  imports: [PrecedenceFactoryToolbar, PrecedenceExistingToolbarItem, OrigamiToolbarItem],
  providers: [ToolbarPrecedenceSettings],
  host: { "data-toolbar-case": "precedence" },
  template,
})
export class ToolbarPrecedence {
  readonly settings = inject(ToolbarPrecedenceSettings);
}
