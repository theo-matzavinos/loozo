import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

export type ColorSchemeVariant = 'light' | 'dark';

/** Injectable that holds a signal of the current color scheme and a method to toggle between light and dark modes. */
@Injectable({ providedIn: 'root' })
export class ColorScheme {
  #current = signal<ColorSchemeVariant>('light');
  /** The current color scheme. */
  current = this.#current.asReadonly();

  private document = inject(DOCUMENT);

  constructor() {
    const initialScheme = this.getColorScheme();
    this.#current.set(initialScheme);
  }

  /** Toggle between light and dark modes. */
  toggle() {
    document.documentElement.classList.toggle('dark');

    const currentScheme = this.getColorScheme();

    this.#current.set(currentScheme);
    localStorage.setItem('theme', currentScheme);
  }

  private getColorScheme() {
    return this.document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light';
  }
}
