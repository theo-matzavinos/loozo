import { Component, computed, input } from "@angular/core";
import { OrigamiAvatar, OrigamiAvatarFallback, OrigamiAvatarImage } from "@loozo/origami-ui/avatar";

const photo =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">` +
      `<rect width="64" height="64" fill="#0e7490"/>` +
      `<circle cx="32" cy="25" r="12" fill="#e0f2fe"/>` +
      `<path d="M10 64c2-14 11-21 22-21s20 7 22 21z" fill="#e0f2fe"/></svg>`,
  );

/** Bytes that aren't an image: the browser reports it as an error. */
const broken = "data:image/png;base64,bm90IGFuIGltYWdl";

// A profile picture with its initials as the fallback. The avatar is named by its root, so the
// image and the initials are decorative. Origami hides whichever shouldn't show; the stacking
// is this component's CSS.
@Component({
  selector: "app-profile-picture",
  imports: [OrigamiAvatar, OrigamiAvatarImage, OrigamiAvatarFallback],
  template: `
    <span ogAvatar #avatar="ogAvatar" role="img" aria-label="Theo Matzavinos" class="avatar">
      <span ogAvatarFallback aria-hidden="true">{{ initials("Theo Matzavinos") }}</span>
      <img ogAvatarImage [src]="src()" alt="" />
    </span>
    <p>Status: {{ avatar.state.status() }}</p>
  `,
  styles: `
    .avatar {
      display: grid;
      inline-size: 4rem;
      block-size: 4rem;
      border-radius: 50%;
      overflow: hidden;
    }

    .avatar > * {
      grid-area: 1 / 1;
      inline-size: 100%;
      block-size: 100%;
    }

    .avatar > img {
      object-fit: cover;
    }

    .avatar > [ogAvatarFallback]:not([hidden]) {
      display: grid;
      place-items: center;
      background: var(--border, #64748b);
      color: var(--surface, #ffffff);
      font-weight: 600;
    }
  `,
})
export class ProfilePicture {
  readonly source = input<"photo" | "missing" | "broken">("photo");

  readonly src = computed(() => {
    const source = this.source();

    if (source === "photo") {
      return photo;
    }

    if (source === "broken") {
      return broken;
    }

    return null;
  });

  /** "Theo Matzavinos" → "TM": the first letter of the first and the last word. */
  initials(name: string): string {
    const words = name.trim().split(/\s+/);
    let letters = words[0]?.[0] ?? "";

    if (words.length > 1) {
      letters += words.at(-1)?.[0] ?? "";
    }

    return letters.toLocaleUpperCase();
  }
}
