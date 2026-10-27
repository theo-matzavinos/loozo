import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from "@angular/core";
import {
  OrigamiAlertDialog,
  OrigamiDialogClose,
  OrigamiDialogContent,
  OrigamiDialogTitle,
} from "@loozo/origami-ui/dialog";
import {
  OrigamiMenu,
  OrigamiMenuContent,
  OrigamiMenuItem,
  OrigamiMenuSeparator,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

type Todo = { readonly id: number; readonly title: string };

// Delete… opens a confirmation from the menu's (select): focus is on the row's button by then, so
// Cancel returns there. Deleting removes that button, so the next row's button takes focus, or
// the list once it's empty.
@Component({
  selector: "app-row-actions",
  imports: [
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuSeparator,
    OrigamiAlertDialog,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogClose,
  ],
  template: `
    <ul #list tabindex="-1" aria-label="Todos">
      @for (todo of todos(); track todo.id) {
        <li>
          {{ todo.title }}
          <div ogMenu [disabled]="disabled()">
            <button ogMenuTrigger [attr.aria-label]="'Actions for ' + todo.title">⋯</button>
            <div ogMenuContent class="menu" align="end" [gap]="4">
              <button ogMenuItem (select)="duplicate(todo)">Duplicate</button>
              <button ogMenuItem disabled>Share</button>
              <div ogMenuSeparator></div>
              <button ogMenuItem (select)="deleting.set(todo.id)">Delete…</button>
            </div>
          </div>
          <div
            ogAlertDialog
            [dismissible]="true"
            [open]="deleting() === todo.id"
            (openChange)="deleting.set(null)"
          >
            <dialog ogDialogContent>
              <h2 ogDialogTitle>Delete “{{ todo.title }}”?</h2>
              <button ogDialogClose autofocus>Cancel</button>
              <button type="button" (click)="remove(todo)">Delete</button>
            </dialog>
          </div>
        </li>
      } @empty {
        <li>Nothing left to do.</li>
      }
    </ul>
  `,
  styles: `
    li {
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .menu {
      padding: 0.25rem;
      border: 1px solid currentColor;
      color: inherit;
      background: var(--surface, Canvas);
    }

    .menu:popover-open {
      display: flex;
      flex-direction: column;
    }

    .menu [role="menuitem"] {
      all: unset;
      padding: 0.25rem 0.5rem;
    }

    .menu [role="menuitem"]:focus {
      background: color-mix(in srgb, currentColor 15%, transparent);
    }

    .menu [role="menuitem"][data-disabled] {
      opacity: 0.5;
    }

    .menu [role="separator"] {
      margin-block: 0.25rem;
      border-block-start: 1px solid currentColor;
    }
  `,
})
export class RowActions {
  readonly disabled = input(false);
  readonly todos = signal<readonly Todo[]>([
    { id: 1, title: "Water the plants" },
    { id: 2, title: "Book the dentist" },
    { id: 3, title: "Renew the passport" },
  ]);
  readonly deleting = signal<number | null>(null);

  readonly #injector = inject(Injector);
  private readonly list = viewChild.required<ElementRef<HTMLElement>>("list");
  private readonly triggers = viewChildren(OrigamiMenuTrigger, { read: ElementRef });
  #nextId = 4;

  duplicate(todo: Todo): void {
    this.todos.update((todos) => [...todos, { id: this.#nextId++, title: `${todo.title} (copy)` }]);
  }

  remove(todo: Todo): void {
    const todos = this.todos();
    const triggers = this.triggers();
    const index = todos.indexOf(todo);
    const next = triggers[index + 1] ?? triggers[index - 1];
    const remaining: Todo[] = [];

    for (const current of todos) {
      if (current !== todo) {
        remaining.push(current);
      }
    }

    // The row, its button and its dialog go together, so focus would fall to the body: once
    // they're gone, focus the next row's button, the previous one's after the last row, or the
    // list when no row is left.
    this.todos.set(remaining);
    afterNextRender(() => (next ?? this.list()).nativeElement.focus(), {
      injector: this.#injector,
    });
  }
}
