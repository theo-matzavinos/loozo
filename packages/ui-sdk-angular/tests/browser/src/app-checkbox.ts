import { Directive, inject } from "@angular/core";
import { UiCheckbox } from "@loozo/ui-sdk-angular/checkbox";

/** A consumer's own checkbox, composed through `hostDirectives`, reading state in a host binding. */
@Directive({
  selector: "button[appCheckbox]",
  hostDirectives: [
    {
      directive: UiCheckbox,
      inputs: ["checked", "defaultChecked", "name", "disabled"],
      outputs: ["checkedChange", "checkedChangeRequest"],
    },
  ],
  host: { class: "app-checkbox", "[class.app-checkbox-on]": "checkbox.state().checked" },
})
export class AppCheckbox {
  protected readonly checkbox = inject(UiCheckbox);
}
