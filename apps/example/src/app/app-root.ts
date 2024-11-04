import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Button } from './shared/button';
import { LucideMoon, LucideSun } from '@loozo/ng-lucide';
import { ColorScheme } from '../color-scheme';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [Button, LucideMoon, LucideSun, RouterOutlet, RouterLink],
  host: {
    class: 'flex flex-col px-12 py-8',
  },
  template: `
    <header class="flex px-4 py-2 shadow rounded bg-foreground/5 top-0">
      <nav class="flex gap-2">
        <a [routerLink]="['/', 'icons']" appBtn variant="link">Icons</a>
        <a [routerLink]="['/', 'form']" appBtn variant="link">Form</a>
      </nav>
      <button
        class="ml-auto"
        type="button"
        appBtn
        variant="ghost"
        aria-label="Toggle color scheme."
        (click)="colorScheme.toggle()"
      >
        @if (colorScheme.current() === 'dark') {
          <lucide-sun class="w-4 h-4 mr-2" /> Light Mode
        } @else {
          <lucide-moon class="w-4 h-4 mr-2" /> Dark Mode
        }
      </button>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
})
export class AppRoot {
  colorScheme = inject(ColorScheme);
}
