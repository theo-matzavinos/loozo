import { effect, inject } from "@angular/core";
import { Title } from "@angular/platform-browser";

/** Call once per page. `title` returns undefined while the page's content is unavailable. */
export function pageTitle(title: () => string | undefined) {
  const titleService = inject(Title);

  effect(() => {
    const text = title();

    if (text === undefined) {
      return;
    }

    titleService.setTitle(`${text} · loozo docs`);
  });
}
