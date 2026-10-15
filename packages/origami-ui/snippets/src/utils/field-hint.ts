import { Component, Directive, Service, signal } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

@Service()
export class HintLog {
  readonly shown = signal<readonly string[]>([]);
}

@Directive({
  selector: "input[appFieldHint]",
  exportAs: "appFieldHint",
  host: { "[attr.aria-describedby]": "hintId", "(focus)": "record()" },
})
export class FieldHint {
  // Stable for this mounted element, and the same on the server and the hydrating client.
  readonly hintId = injectUniqueId("field-hint");
  // Captures the injector now; resolves `HintLog` only on the first focus.
  readonly #log = injectDeferred(HintLog);

  record(): void {
    const log = this.#log();

    log.shown.update((shown) => [...shown, this.hintId]);
  }
}

@Component({
  selector: "app-email-field",
  imports: [FieldHint],
  template: `
    <label>
      Email
      <input type="email" appFieldHint #field="appFieldHint" />
    </label>
    <p [id]="field.hintId">We only use it to send receipts.</p>
  `,
})
export class EmailField {}
