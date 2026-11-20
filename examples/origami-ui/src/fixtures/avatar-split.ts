import { isPlatformBrowser } from "@angular/common";
import { Component, PLATFORM_ID, inject, signal } from "@angular/core";
import { OrigamiAvatar, OrigamiAvatarFallback, OrigamiAvatarImage } from "@loozo/origami-ui/avatar";

// AV10: the root and its Fallback in the fixture's view, the Image in a child component inside
// its own hydrate boundary. Without incremental hydration the server renders the block's
// placeholder, so the case runs under incremental hydration only.

@Component({
  selector: "acceptance-avatar-split-image",
  imports: [OrigamiAvatarImage],
  template: `<img
    ogAvatarImage
    data-testid="split-image"
    src="/avatar-image/split.svg"
    alt=""
    width="80"
    height="80"
  />`,
  styles: `
    :host {
      display: contents;
    }

    img {
      grid-area: 1 / 1;
      inline-size: 80px;
      block-size: 80px;
    }
  `,
})
export class AvatarSplitImage {}

@Component({
  selector: "acceptance-avatar-split-fixture",
  imports: [OrigamiAvatar, OrigamiAvatarFallback, AvatarSplitImage],
  host: { "[attr.data-client-rendered]": "clientRendered" },
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach split avatar behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>
    <button type="button" data-testid="split-hydrate-image" (click)="imageHydrated.set(true)">
      Hydrate the Image
    </button>

    <span ogAvatar data-testid="split" class="avatar">
      <span ogAvatarFallback data-testid="split-fallback">SP</span>
      @defer (hydrate when imageHydrated()) {
        <acceptance-avatar-split-image />
      } @placeholder {
        <span>Image</span>
      }
    </span>
  `,
  styles: `
    .avatar {
      display: inline-grid;
      inline-size: 80px;
      block-size: 80px;
      overflow: hidden;
    }

    .avatar > * {
      grid-area: 1 / 1;
    }

    .avatar > [ogAvatarFallback]:not([hidden]) {
      display: grid;
      place-items: center;
      background: #b45309;
      color: #ffffff;
      font: bold 14px sans-serif;
    }
  `,
})
export class AvatarSplitFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);
  readonly imageHydrated = signal(false);
}
