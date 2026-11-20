import {
  DestroyRef,
  Directive,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
} from "@angular/core";
import { injectDeferred } from "@loozo/origami-ui/utils";
import { AvatarContext } from "./avatar-context";
import type { AvatarImageRegistration } from "./avatar-context";
import { OrigamiAvatarImageOptions } from "./avatar-image-options";

/**
 * The image of an Avatar: a native `<img>` whose `src` Origami renders from its `src` input, so
 * the server sends it and the browser loads and paints it natively, before and while its block is
 * dehydrated. It has no `state`: read the root's. Requires a nearest Avatar root, which supports
 * one mounted Image; a second fails when it registers.
 *
 * Status: once it has rendered in the browser, it reads its own element after every render that
 * changed its source, and on its native `load` and `error`: the current source is `"loaded"` once
 * the element is `complete` with a nonzero `naturalWidth`, else `"error"`, and only while the
 * element's `src` attribute is the current source. An SVG without an intrinsic width may report a
 * `naturalWidth` of 0 in some engines, which reads as `"error"`.
 *
 * Host semantics: `src`, absent without a source; `hidden` while `"idle"` or `"error"`, never
 * while `"loading"`; `aria-hidden="true"` unless `"loaded"`, so exactly one of the image and the
 * Fallback is exposed. `alt`, `srcset`, `sizes`, `loading`, `decoding`, `crossorigin`,
 * `referrerpolicy` and dimensions are the consumer's native attributes; don't bind `aria-hidden`
 * or `hidden` yourself. It has no template or host event listener, so the server's node carries no
 * `jsaction`, and an image's `load` or `error` never hydrates an incremental block early.
 *
 * Source changes: a new source keeps the previous image's pixels until it decodes, with the
 * status `"loading"` and the Fallback unhidden underneath; going through null clears them. Only
 * `src` is tracked: a `srcset` or `sizes` change on its own isn't. Setting the source it already
 * has doesn't retry a failed image; a rendered null in between does. It can't be combined with
 * `ngSrc` on the same element.
 *
 * @example
 * ```html
 * <span ogAvatar class="avatar">
 *   <span ogAvatarFallback>Theo Matzavinos</span>
 *   <img ogAvatarImage [src]="photoUrl()" alt="Theo Matzavinos" />
 * </span>
 * ```
 */
@Directive({
  selector: "img[ogAvatarImage]",
  providers: [OrigamiAvatarImageOptions.provideExisting(() => OrigamiAvatarImage)],
  host: {
    "[attr.src]": "source()",
    "[attr.hidden]": "hiddenAttribute()",
    "[attr.aria-hidden]": "ariaHidden()",
  },
})
export class OrigamiAvatarImage implements OrigamiAvatarImageOptions {
  /**
   * Own source input, default null: a URL or data URI, or null, undefined or `""` for none, which
   * all normalize to null. Replaced Options supply the effective source instead.
   */
  readonly src = input<string | null, string | null | undefined>(null, {
    transform: (value) => value || null,
  });

  readonly #options = injectDeferred(OrigamiAvatarImageOptions);
  readonly #context = inject(AvatarContext);
  readonly #element = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;
  readonly #destroyRef = inject(DestroyRef);
  #registration: AvatarImageRegistration | null = null;
  #listening = false;

  /**
   * @internal The one effective source: the `src` attribute, the registration and its reset all
   * read it. `""` from replaced Options normalizes to null.
   */
  protected readonly source = computed(() => this.#options().src() || null);
  /** @internal `hidden` while there's nothing to show: `"idle"` or `"error"`. */
  protected readonly hiddenAttribute = computed(() => {
    const status = this.#context.status();

    if (status === "idle" || status === "error") {
      return "";
    }

    return null;
  });
  /** @internal `aria-hidden="true"` unless loaded, so only the Fallback is exposed meanwhile. */
  protected readonly ariaHidden = computed(() => {
    if (this.#context.status() === "loaded") {
      return null;
    }

    return "true";
  });

  constructor() {
    // Browser-only: render effects never run on the server. It runs after the render that wrote
    // the source's attribute, and again after each render that changed the source.
    afterRenderEffect(() => {
      this.source();

      if (!this.#listening) {
        this.#listen();
      }

      this.#reconcile();
    });
  }

  /** @internal Registers this Image once Angular has set its inputs; a second mounted Image fails. */
  ngOnInit(): void {
    this.#registration = this.#context.register(this.source, this.#destroyRef);
  }

  /** Native `load` and `error` only prompt a new look at the element; they decide nothing. */
  #listen(): void {
    const reconcile = (): void => {
      this.#reconcile();
    };

    this.#listening = true;
    this.#element.addEventListener("load", reconcile);
    this.#element.addEventListener("error", reconcile);
    this.#destroyRef.onDestroy(() => {
      this.#element.removeEventListener("load", reconcile);
      this.#element.removeEventListener("error", reconcile);
    });
  }

  /**
   * Records what the browser did with the current source, read from this element, never from an
   * event. Nothing without a source, before the attribute for the current source has rendered, or
   * while the element is still loading.
   */
  #reconcile(): void {
    const registration = this.#registration;
    const source = this.source();

    if (registration === null || source === null) {
      return;
    }

    const rendered = this.#element.getAttribute("src") === source;

    if (!rendered || !this.#element.complete) {
      return;
    }

    if (this.#element.naturalWidth > 0) {
      registration.observed.set("loaded");

      return;
    }

    registration.observed.set("error");
  }
}
