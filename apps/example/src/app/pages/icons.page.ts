import { KeyValuePipe, NgComponentOutlet } from '@angular/common';
import { Component } from '@angular/core';
import * as icons from '@loozo/ng-lucide';

@Component({
  selector: 'app-icons',
  standalone: true,
  imports: [NgComponentOutlet, KeyValuePipe],
  template: `
    <div class="grid grid-cols-8 gap-4">
      @for (icon of icons | keyvalue; track icon) {
        <div>
          <ng-container [ngComponentOutlet]="icon.value" />
          <div class="truncate">{{ icon.key }}</div>
        </div>
      }
    </div>
  `,
})
export default class IconsPage {
  icons = icons;
}
