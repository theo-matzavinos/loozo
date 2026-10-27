import {
  Component,
  DOCUMENT,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
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
  OrigamiMenuLink,
  OrigamiMenuSeparator,
  OrigamiMenuTrigger,
} from "@loozo/origami-ui/menu";

/**
 * One table row's actions, modelled on core-ui-lib's todo row actions: an icon Trigger, Edit (a
 * RouterLink), a separator and Delete…, which opens a confirmation AlertDialog beside the menu.
 * Each `(select)` reports what was focused while its listener ran.
 */
@Component({
  selector: "acceptance-menu-row-actions",
  imports: [
    RouterLink,
    OrigamiMenu,
    OrigamiMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
    OrigamiMenuLink,
    OrigamiMenuSeparator,
    OrigamiAlertDialog,
    OrigamiDialogContent,
    OrigamiDialogTitle,
    OrigamiDialogClose,
  ],
  template: `
    <div ogMenu>
      <button
        ogMenuTrigger
        [attr.aria-label]="'Actions for row ' + row()"
        [attr.data-testid]="'row-trigger-' + row()"
      >
        ⋯
      </button>
      <div ogMenuContent align="end" class="menu" [attr.data-testid]="'row-menu-' + row()">
        <a
          ogMenuLink
          [routerLink]="[]"
          [queryParams]="{ edit: row() }"
          [attr.data-testid]="'row-edit-' + row()"
          (select)="selected.emit('edit@' + focused())"
          >Edit</a
        >
        <div ogMenuSeparator></div>
        <button ogMenuItem [attr.data-testid]="'row-delete-' + row()" (select)="askDelete()">
          Delete…
        </button>
      </div>
    </div>
    <div ogAlertDialog [(open)]="deleteOpen" [dismissible]="true">
      <dialog ogDialogContent [attr.data-testid]="'row-dialog-' + row()">
        <h2 ogDialogTitle>Delete row {{ row() }}?</h2>
        <button ogDialogClose autofocus [attr.data-testid]="'row-cancel-' + row()">Cancel</button>
        <button type="button" [attr.data-testid]="'row-confirm-' + row()" (click)="confirm()">
          Delete
        </button>
      </dialog>
    </div>
  `,
})
export class MenuRowActions {
  readonly row = input.required<number>();
  /** The confirmed deletion: the table removes this row. */
  readonly removed = output<void>();
  /** `name@testid`: an activated item and what was focused while its `(select)` ran. */
  readonly selected = output<string>();
  readonly deleteOpen = signal(false);

  readonly #document = inject(DOCUMENT);
  private readonly trigger = viewChild.required(OrigamiMenuTrigger, { read: ElementRef });

  /** Focuses this row's Trigger: the table's recipe after removing the row before it. */
  focusTrigger(): void {
    (this.trigger().nativeElement as HTMLElement).focus();
  }

  protected askDelete(): void {
    this.selected.emit("delete@" + this.focused());
    this.deleteOpen.set(true);
  }

  protected confirm(): void {
    this.deleteOpen.set(false);
    this.removed.emit();
  }

  protected focused(): string {
    return this.#document.activeElement?.getAttribute("data-testid") ?? "none";
  }
}
