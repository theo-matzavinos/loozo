import { Directive, inject } from "@angular/core";
import { UiToggle } from "@loozo/ui-sdk-angular/toggle";

/** A consumer's own toggle, composed through `hostDirectives`, reading state in a host binding. */
@Directive({
  selector: "button[appToggle]",
  hostDirectives: [
    {
      directive: UiToggle,
      inputs: ["pressed", "defaultPressed", "disabled"],
      outputs: ["pressedChange", "pressedChangeRequest"],
    },
  ],
  host: { class: "app-toggle", "[class.app-toggle-on]": "toggle.state().pressed" },
})
export class AppToggle {
  protected readonly toggle = inject(UiToggle);
}
