import {
  Component,
  Directive,
  ViewContainerRef,
  computed,
  inject,
  input,
  inputBinding,
  signal,
  twoWayBinding,
  type Binding,
  type OnInit,
  type Type,
  type WritableSignal,
} from "@angular/core";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { OrigamiField, OrigamiFieldControl, OrigamiFieldLabel } from "@loozo/origami-ui/field";
import {
  OrigamiSelect,
  OrigamiSelectContent,
  OrigamiSelectOption,
  OrigamiSelectTrigger,
} from "@loozo/origami-ui/select";
import type { DemoControl } from "../generated/content/model.generated.js";

/**
 * Creates a demo component with bindings, which `NgComponentOutlet` can't pass. It's created in
 * `ngOnInit`, once the inputs are set and also on the server, so it prerenders and hydrates.
 */
// Exported only because Angular's compiler imports what a component's `imports` name.
@Directive({ selector: "[docsDemoInstance]" })
export class DemoInstance implements OnInit {
  readonly docsDemoInstance = input.required<Type<unknown>>();
  readonly docsDemoBindings = input.required<Binding[]>();

  readonly container = inject(ViewContainerRef);

  ngOnInit() {
    this.container.createComponent(this.docsDemoInstance(), {
      bindings: this.docsDemoBindings(),
    });
  }
}

/** A running snippet with a control for each input and model of its component. */
@Component({
  selector: "docs-demo-playground",
  imports: [
    DemoInstance,
    OrigamiField,
    OrigamiFieldLabel,
    OrigamiFieldControl,
    OrigamiCheckbox,
    OrigamiSelect,
    OrigamiSelectTrigger,
    OrigamiSelectContent,
    OrigamiSelectOption,
  ],
  template: `
    <div class="docs-demo-output" role="group" aria-label="Running example">
      <ng-container [docsDemoInstance]="component()" [docsDemoBindings]="bindings()" />
    </div>
    <fieldset class="docs-demo-controls">
      <legend>Inputs</legend>
      @for (entry of entries(); track entry.name) {
        @switch (entry.kind) {
          @case ("boolean") {
            <div ogField class="docs-demo-field">
              <button
                ogCheckbox
                class="docs-demo-checkbox"
                [checked]="entry.value()"
                (checkedChange)="entry.value.set($event)"
              ></button>
              <label ogFieldLabel
                ><code>{{ entry.name }}</code></label
              >
            </div>
          }
          @case ("number") {
            <div ogField class="docs-demo-field">
              <label ogFieldLabel
                ><code>{{ entry.name }}</code></label
              >
              <input
                ogFieldControl
                #field
                type="number"
                [value]="entry.value()"
                (input)="setNumber(entry.value, field.valueAsNumber)"
              />
            </div>
          }
          @case ("string") {
            <div ogField class="docs-demo-field">
              <label ogFieldLabel
                ><code>{{ entry.name }}</code></label
              >
              <input
                ogFieldControl
                #field
                type="text"
                [value]="entry.value()"
                (input)="entry.value.set(field.value)"
              />
            </div>
          }
          @case ("options") {
            <div ogField class="docs-demo-field">
              <span ogFieldLabel
                ><code>{{ entry.name }}</code></span
              >
              <div
                ogSelect
                [value]="entry.options.indexOf(entry.value())"
                (valueChange)="choose(entry.value, entry.options, $event)"
              >
                <button ogSelectTrigger class="docs-demo-select">
                  {{ entry.value() ?? "none" }}
                </button>
                <div ogSelectContent class="docs-demo-select-list" [gap]="4">
                  @for (option of entry.options; track $index) {
                    <div ogSelectOption [value]="$index">{{ option ?? "none" }}</div>
                  }
                </div>
              </div>
            </div>
          }
          @case ("fixed") {
            <p>
              <code>{{ entry.name }}</code>
              <span class="fixed">{{ entry.type }}, not adjustable</span>
            </p>
          }
        }
      }
    </fieldset>
  `,
})
export class DemoPlayground {
  readonly component = input.required<Type<unknown>>();
  readonly controls = input.required<readonly DemoControl[]>();

  /**
   * One entry per control; editable ones hold the value they bind. Each kind gets its own branch so
   * its signal keeps that kind's value type.
   */
  readonly entries = computed(() => {
    const entries = [];

    for (const control of this.controls()) {
      if (control.kind === "fixed") {
        entries.push(control);
      } else if (control.kind === "options") {
        entries.push({ ...control, value: signal(control.initial) });
      } else if (control.kind === "boolean") {
        entries.push({ ...control, value: signal(control.initial) });
      } else if (control.kind === "number") {
        entries.push({ ...control, value: signal(control.initial) });
      } else {
        entries.push({ ...control, value: signal(control.initial) });
      }
    }

    return entries;
  });

  readonly bindings = computed(() => {
    const bindings: Binding[] = [];

    for (const entry of this.entries()) {
      if (entry.kind === "fixed") {
        continue;
      }

      if (entry.binding === "model") {
        bindings.push(twoWayBinding(entry.name, entry.value));
      } else {
        bindings.push(inputBinding(entry.name, entry.value));
      }
    }

    return bindings;
  });

  /**
   * The options can include null, which a Select value can't tell from "nothing selected", so the
   * Select is keyed by index. Only a choice writes it, so a null index never arrives; the check
   * narrows the type.
   */
  choose(
    value: WritableSignal<string | null>,
    options: readonly (string | null)[],
    index: number | null,
  ) {
    if (index !== null) {
      value.set(options[index]);
    }
  }

  /** An empty or partial number field has no value; the input keeps its last one. */
  setNumber(value: WritableSignal<number>, number: number) {
    if (!Number.isNaN(number)) {
      value.set(number);
    }
  }
}
