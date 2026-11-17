import { Component, computed, signal } from "@angular/core";
import { OrigamiCheckbox } from "@loozo/origami-ui/checkbox";
import { OrigamiField, OrigamiFieldLabel } from "@loozo/origami-ui/field";

// The parent derives checked and mixed over the vehicles its handler can change, so the Bus,
// which is disabled, is outside that set and its label says "available".
@Component({
  selector: "app-select-all",
  imports: [OrigamiCheckbox, OrigamiField, OrigamiFieldLabel],
  template: `
    <div ogField class="row">
      <button
        ogCheckbox
        class="box"
        aria-controls="vehicle-car vehicle-van vehicle-bus"
        [checked]="all()"
        [mixed]="some()"
        [disabled]="selectable().length === 0"
        (checkedChange)="selectAll($event)"
      ></button>
      <label ogFieldLabel>Select all available vehicles</label>
    </div>
    <ul>
      @for (vehicle of vehicles; track vehicle.id) {
        <li ogField class="row">
          <button
            ogCheckbox
            class="box"
            [id]="'vehicle-' + vehicle.id"
            [disabled]="vehicle.disabled"
            [checked]="selected().has(vehicle.id)"
            (checkedChange)="select(vehicle.id, $event)"
          ></button>
          <label ogFieldLabel>{{ vehicle.label }}</label>
        </li>
      }
    </ul>
  `,
  styles: `
    ul {
      margin: 0.5rem 0 0;
      padding-inline-start: 1.75rem;
      list-style: none;
    }

    .row {
      display: flex;
      gap: 0.5rem;
      align-items: center;
      margin-block: 0.25rem;
    }

    .box {
      inline-size: 1.25rem;
      block-size: 1.25rem;
      padding: 0;
      border: 1px solid currentColor;
      border-radius: 4px;
      background: none;
      color: inherit;
    }

    .box[data-checked],
    .box[data-mixed] {
      background: var(--accent);
    }

    .box[data-checked]::after {
      content: "✓";
    }

    .box[data-mixed]::after {
      content: "−";
    }

    .box[data-disabled] {
      opacity: 0.5;
    }
  `,
})
export class SelectAll {
  readonly vehicles = [
    { id: "car", label: "Car", disabled: false },
    { id: "van", label: "Van", disabled: false },
    { id: "bus", label: "Bus", disabled: true },
  ];
  readonly selected = signal<ReadonlySet<string>>(new Set(["car"]));
  /** The children selectAll can change. */
  readonly selectable = computed(() => {
    const ids: string[] = [];

    for (const vehicle of this.vehicles) {
      if (!vehicle.disabled) {
        ids.push(vehicle.id);
      }
    }

    return ids;
  });
  readonly count = computed(() => {
    let count = 0;

    for (const id of this.selectable()) {
      if (this.selected().has(id)) {
        count++;
      }
    }

    return count;
  });
  readonly all = computed(
    () => this.selectable().length > 0 && this.count() === this.selectable().length,
  );
  readonly some = computed(() => this.count() > 0 && !this.all());

  selectAll(checked: boolean): void {
    const next = new Set(this.selected());

    for (const id of this.selectable()) {
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }

    this.selected.set(next);
  }

  select(id: string, checked: boolean): void {
    const next = new Set(this.selected());

    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }

    this.selected.set(next);
  }
}
