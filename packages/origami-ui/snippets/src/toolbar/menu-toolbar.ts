import { Component } from "@angular/core";
import { OrigamiMenu, OrigamiMenuContent, OrigamiMenuItem } from "@loozo/origami-ui/menu";
import {
  OrigamiToolbar,
  OrigamiToolbarItem,
  OrigamiToolbarMenuTrigger,
} from "@loozo/origami-ui/toolbar";

// A Toolbar Menu Trigger is one control in the Toolbar's arrow sequence, and keeps the Toolbar's
// tab stop while focus is in its menu.
@Component({
  selector: "app-menu-toolbar",
  imports: [
    OrigamiToolbar,
    OrigamiToolbarItem,
    OrigamiMenu,
    OrigamiToolbarMenuTrigger,
    OrigamiMenuContent,
    OrigamiMenuItem,
  ],
  template: `
    <div ogToolbar aria-label="Formatting">
      <button ogToolbarItem (click)="undo()">Undo</button>
      <button ogToolbarItem (click)="redo()">Redo</button>
      <div ogMenu>
        <button ogToolbarMenuTrigger>More</button>
        <div ogMenuContent>
          <button ogMenuItem (select)="clearFormatting()">Clear formatting</button>
          <button ogMenuItem (select)="insertDate()">Insert date</button>
        </div>
      </div>
    </div>
  `,
})
export class MenuToolbar {
  undo(): void {}

  redo(): void {}

  clearFormatting(): void {}

  insertDate(): void {}
}
