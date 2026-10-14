import { Directive, ElementRef, computed, inject, input } from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";
import { Router } from "@angular/router";

/**
 * Renders HTML from the generated content modules and routes its docs links client-side.
 *
 * That HTML is produced at build time from this repository's READMEs and TSDoc and imported as
 * module constants; no user or runtime input reaches it. It is trusted, so it bypasses Angular's
 * sanitizer, which would otherwise strip the inline style variables Shiki uses for code colors.
 * This is the only place in the app that bypasses sanitization.
 */
@Directive({
  selector: "[docsContentHtml]",
  host: { "[innerHTML]": "trustedHtml()", "(click)": "followDocsLink($event)" },
})
export class ContentHtml {
  readonly docsContentHtml = input.required<string>();

  readonly sanitizer = inject(DomSanitizer);
  readonly router = inject(Router);
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly trustedHtml = computed(() => {
    return this.sanitizer.bypassSecurityTrustHtml(this.docsContentHtml());
  });

  followDocsLink(event: MouseEvent) {
    const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;

    if (event.defaultPrevented || event.button !== 0 || modified) {
      return;
    }

    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest("a[data-docs-link]");

    if (link === null || !this.host.nativeElement.contains(link)) {
      return;
    }

    const target = link.getAttribute("target");
    const href = link.getAttribute("href");

    if ((target !== null && target !== "_self") || href === null) {
      return;
    }

    // Docs hrefs are relative to the site root (the <base href>), so they map to router URLs directly.
    event.preventDefault();
    void this.router.navigateByUrl(`/${href}`);
  }
}
