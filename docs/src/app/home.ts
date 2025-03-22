import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  NgDocRootComponent,
  NgDocSidebarComponent,
  NgDocNavbarComponent,
  NgDocThemeToggleComponent,
} from '@ng-doc/app';

@Component({
  imports: [
    RouterModule,
    NgDocRootComponent,
    NgDocNavbarComponent,
    NgDocSidebarComponent,
    NgDocThemeToggleComponent,
  ],
  selector: 'app-home',
  template: `
    <ng-doc-root>
      <ng-doc-navbar>
        <h3 class="brand" style="margin: 0" ngDocNavbarLeft>Radian</h3>
        <ng-doc-theme-toggle ngDocNavbarRight />
      </ng-doc-navbar>
      <ng-doc-sidebar></ng-doc-sidebar>
      <router-outlet></router-outlet>
    </ng-doc-root>
  `,
  styles: ``,
})
export class Home {}
