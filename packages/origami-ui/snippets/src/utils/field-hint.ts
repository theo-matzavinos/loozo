import { Component, Directive, Service, input, signal } from "@angular/core";
import { injectDeferred, injectUniqueId } from "@loozo/origami-ui/utils";

@Service()
export class HintLog {
  readonly shown = signal<readonly string[]>([]);
}

@Directive({ selector: "[appHint]", exportAs: "appHint", host: { "[id]": "id()" } })
export class Hint {
  // The element's own ID unless you bind one; hydration keeps the ID the server rendered.
  readonly id = input(injectUniqueId("hint"));
}

@Directive({
  selector: "input[appFieldHint]",
  host: { "[attr.aria-describedby]": "hint().id()", "(focus)": "record()" },
})
export class FieldHint {
  readonly hint = input.required<Hint>({ alias: "appFieldHint" });
  // Captures the injector now; resolves `HintLog` only on the first focus.
  readonly #log = injectDeferred(HintLog);

  record(): void {
    const log = this.#log();

    log.shown.update((shown) => [...shown, this.hint().id()]);
  }
}

@Component({
  selector: "app-email-field",
  imports: [FieldHint, Hint],
  template: `
    <label>
      Email
      <input type="email" [appFieldHint]="hint" />
    </label>
    <p appHint #hint="appHint">We only use it to send receipts.</p>
  `,
})
export class EmailField {}
