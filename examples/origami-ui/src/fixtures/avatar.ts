import { isPlatformBrowser } from "@angular/common";
import {
  Component,
  Directive,
  PLATFORM_ID,
  afterEveryRender,
  inject,
  input,
  signal,
} from "@angular/core";
import {
  OrigamiAvatar,
  OrigamiAvatarFallback,
  OrigamiAvatarImage,
  OrigamiAvatarImageOptions,
} from "@loozo/origami-ui/avatar";

// AV: every row has its own image URL, so no two rows share an entry in the browser's list of
// available images. The spec serves `/avatar-image/*` through `page.route`: opaque single-colour
// SVGs (cyan for an initial source, magenta for a replacement), held or failing as each case
// needs. The fallback is orange.

function square(fill: string): string {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${fill}"/></svg>`,
    )
  );
}

/** An opaque cyan 80 × 80 data URI, complete as soon as the parser has decoded it. */
export const cyanData = square("#06b6d4");
/** An opaque magenta 80 × 80 data URI. */
export const magentaData = square("#d946ef");

/** One probed avatar's attributes as an after-render pass found them, before its reconcile. */
export interface AvatarPass {
  readonly testid: string;
  readonly status: string | null;
  readonly src: string | null;
  readonly imageHidden: string | null;
  readonly imageAriaHidden: string | null;
  readonly fallbackHidden: string | null;
  readonly root: Element;
  readonly image: Element | null;
  readonly fallback: Element | null;
}

declare global {
  interface Window {
    avatarPasses?: AvatarPass[];
    readFixtureSource?: () => string | null;
  }
}

/**
 * A consumer component composing the root through `hostDirectives`, with the Image in its own
 * view and the Fallback projected from the fixture's template.
 */
@Component({
  selector: "acceptance-app-avatar",
  hostDirectives: [OrigamiAvatar],
  imports: [OrigamiAvatarImage],
  template: `<ng-content /><img
      ogAvatarImage
      data-testid="composer-image"
      [src]="src()"
      [alt]="alt()"
      width="80"
      height="80"
    />`,
  styles: `
    img {
      grid-area: 1 / 1;
      inline-size: 80px;
      block-size: 80px;
    }
  `,
})
export class AppAvatar {
  readonly src = input<string | null | undefined>();
  readonly alt = input("");
}

/** Image Options replaced by a factory reading this wrapper's own input. */
@Directive({
  selector: "img[factoryAvatarImage]",
  hostDirectives: [OrigamiAvatarImage],
  providers: [
    OrigamiAvatarImageOptions.provideFactory(() => ({ src: inject(FactoryAvatarImage).photo })),
  ],
})
export class FactoryAvatarImage {
  readonly photo = input<string | null>(null);
}

/** Image Options replaced by an existing provider: this wrapper, with an input of its own. */
@Directive({
  selector: "img[existingAvatarImage]",
  hostDirectives: [OrigamiAvatarImage],
  providers: [OrigamiAvatarImageOptions.provideExisting(() => ExistingAvatarImage)],
})
export class ExistingAvatarImage implements OrigamiAvatarImageOptions {
  readonly src = input<string | null>(null, { alias: "existingSrc" });
}

/**
 * M3's direct-Options avatar: its source is the fixture's writable signal itself, not a bound
 * input, so a write is the effective source at once, before any render commits its attribute.
 */
@Directive({
  selector: "img[directAvatarImage]",
  hostDirectives: [OrigamiAvatarImage],
  providers: [
    OrigamiAvatarImageOptions.provideFactory(() => ({ src: inject(AvatarFixture).directSource })),
  ],
})
export class DirectAvatarImage {}

@Component({
  selector: "acceptance-avatar-fixture",
  imports: [
    OrigamiAvatar,
    OrigamiAvatarImage,
    OrigamiAvatarFallback,
    AppAvatar,
    FactoryAvatarImage,
    ExistingAvatarImage,
    DirectAvatarImage,
  ],
  host: { "[attr.data-client-rendered]": "clientRendered" },
  template: `
    <button type="button" data-testid="attach-fixture" (click)="attached.set(true)">
      Attach avatar behavior
    </button>
    <output data-testid="fixture-attached">{{ attached() }}</output>

    <h2>Sources</h2>
    <div class="row">
      <span ogAvatar data-probe data-testid="photo" class="avatar">
        <span ogAvatarFallback data-testid="photo-fallback">PH</span>
        <img ogAvatarImage data-testid="photo-image" [src]="photo" alt="" width="80" height="80" />
      </span>
      <span ogAvatar data-probe data-testid="data" class="avatar">
        <span ogAvatarFallback data-testid="data-fallback">DU</span>
        <img ogAvatarImage data-testid="data-image" [src]="data" alt="" width="80" height="80" />
      </span>
      <span ogAvatar data-probe data-testid="slow" class="avatar">
        <span ogAvatarFallback data-testid="slow-fallback">SL</span>
        <img ogAvatarImage data-testid="slow-image" [src]="slow" alt="" width="80" height="80" />
      </span>
      <span ogAvatar data-probe data-testid="broken" class="avatar">
        <span ogAvatarFallback data-testid="broken-fallback">BR</span>
        <img
          ogAvatarImage
          data-testid="broken-image"
          [src]="broken"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <span ogAvatar data-probe data-testid="null" class="avatar">
        <span ogAvatarFallback data-testid="null-fallback">NU</span>
        <img ogAvatarImage data-testid="null-image" [src]="none" alt="" width="80" height="80" />
      </span>
      <span ogAvatar data-probe data-testid="empty" class="avatar">
        <span ogAvatarFallback data-testid="empty-fallback">EM</span>
        <img ogAvatarImage data-testid="empty-image" [src]="empty" alt="" width="80" height="80" />
      </span>
      <span ogAvatar data-probe data-testid="viewbox" class="avatar">
        <span ogAvatarFallback data-testid="viewbox-fallback">VB</span>
        <img
          ogAvatarImage
          data-testid="viewbox-image"
          [src]="viewBox"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <acceptance-app-avatar data-probe data-testid="composer" class="avatar" [src]="data">
        <span ogAvatarFallback data-testid="composer-fallback">CO</span>
      </acceptance-app-avatar>
    </div>

    <h2>Source changes</h2>
    <div class="row">
      <span ogAvatar data-probe data-testid="changes" #changes="ogAvatar" class="avatar">
        <span ogAvatarFallback data-testid="changes-fallback">CH</span>
        <img
          ogAvatarImage
          data-testid="changes-image"
          [src]="changesSource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <output data-testid="changes-status">{{ changes.state.status() }}</output>
      <button type="button" data-testid="changes-a" (click)="changesSource.set(changesA)">A</button>
      <button type="button" data-testid="changes-b" (click)="changesSource.set(changesB)">B</button>
      <button type="button" data-testid="changes-bad" (click)="changesSource.set(changesBad)">
        Bad
      </button>
      <button type="button" data-testid="changes-failed" (click)="changesSource.set(changesFailed)">
        Fails, then retries
      </button>
      <button type="button" data-testid="changes-race" (click)="changesSource.set(changesRace)">
        Slow failing
      </button>
      <button type="button" data-testid="changes-empty" (click)="changesSource.set('')">
        Empty
      </button>
      <button type="button" data-testid="changes-null" (click)="changesSource.set(null)">
        Null
      </button>

      <span ogAvatar data-probe data-testid="direct" class="avatar">
        <span ogAvatarFallback data-testid="direct-fallback">DI</span>
        <img directAvatarImage data-testid="direct-image" alt="" width="80" height="80" />
      </span>
      <button type="button" data-testid="direct-b" (click)="directSource.set(directB)">B</button>
    </div>

    <h2>Lifetimes and composition</h2>
    <div class="row">
      <span ogAvatar data-testid="removable" class="avatar">
        <span ogAvatarFallback data-testid="removable-fallback">RM</span>
        @if (imageMounted()) {
          <img
            ogAvatarImage
            data-testid="removable-image"
            [src]="removableSource()"
            alt=""
            width="80"
            height="80"
          />
        }
      </span>
      <button type="button" data-testid="removable-unmount" (click)="imageMounted.set(false)">
        Remove the Image
      </button>
      <button type="button" data-testid="removable-mount" (click)="imageMounted.set(true)">
        Mount the Image
      </button>
      <button
        type="button"
        data-testid="removable-slow"
        (click)="removableSource.set(removableSlow)"
      >
        Slow source
      </button>

      <span ogAvatar data-testid="fallback-only" class="avatar">
        <span ogAvatarFallback data-testid="fallback-only-fallback">FO</span>
      </span>

      <span ogAvatar data-testid="outer" class="avatar">
        <span ogAvatarFallback data-testid="outer-fallback">
          <span ogAvatar data-testid="inner" class="avatar inner">
            <span ogAvatarFallback data-testid="inner-fallback">IN</span>
            <img
              ogAvatarImage
              data-testid="inner-image"
              [src]="magenta"
              alt=""
              width="40"
              height="40"
            />
          </span>
        </span>
        <img
          ogAvatarImage
          data-testid="outer-image"
          [src]="outerSource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <button type="button" data-testid="outer-set" (click)="outerSource.set(data)">
        Outer source
      </button>

      <span ogAvatar data-testid="factory" class="avatar">
        <span ogAvatarFallback data-testid="factory-fallback">FA</span>
        <img
          factoryAvatarImage
          data-testid="factory-image"
          [photo]="factorySource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <button type="button" data-testid="factory-set" (click)="factorySource.set(data)">
        Factory source
      </button>
      <span ogAvatar data-testid="existing" class="avatar">
        <span ogAvatarFallback data-testid="existing-fallback">EX</span>
        <img
          existingAvatarImage
          data-testid="existing-image"
          [existingSrc]="existingSource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <button type="button" data-testid="existing-set" (click)="existingSource.set(magenta)">
        Existing source
      </button>
    </div>

    <h2>Naming</h2>
    <div class="row">
      <button type="button" aria-label="Account" data-testid="account">
        <span ogAvatar data-testid="decorative" class="avatar">
          <span ogAvatarFallback aria-hidden="true">UA</span>
          <img ogAvatarImage [src]="data" alt="" width="80" height="80" />
        </span>
      </button>
      <span ogAvatar data-testid="named" class="avatar">
        <span ogAvatarFallback data-testid="named-fallback">Theo Matzavinos</span>
        <img
          ogAvatarImage
          data-testid="named-image"
          [src]="named"
          alt="Theo Matzavinos"
          width="80"
          height="80"
        />
      </span>
      <span
        ogAvatar
        role="img"
        aria-label="Theo Matzavinos"
        data-testid="root-named"
        class="avatar"
      >
        <span ogAvatarFallback aria-hidden="true">TM</span>
        <img
          ogAvatarImage
          data-testid="root-named-image"
          [src]="rootNamedSource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <button
        type="button"
        data-testid="root-named-load"
        (click)="rootNamedSource.set(rootNamedPhoto)"
      >
        Load
      </button>
      <button
        type="button"
        data-testid="root-named-broken"
        (click)="rootNamedSource.set(rootNamedBroken)"
      >
        Break
      </button>
    </div>

    <h2>Fallback delay</h2>
    <div class="row">
      <span ogAvatar data-testid="delay" class="avatar delayed">
        <span ogAvatarFallback data-testid="delay-fallback">DL</span>
        <img
          ogAvatarImage
          data-testid="delay-image"
          [src]="delaySource()"
          alt=""
          width="80"
          height="80"
        />
      </span>
      <button type="button" data-testid="delay-held" (click)="delaySource.set(delayHeld)">
        Another source
      </button>
      <button type="button" data-testid="delay-broken" (click)="delaySource.set(delayBroken)">
        Break
      </button>
    </div>
  `,
  styles: `
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin-block: 8px;
    }

    /* The README's stacking: the image, later in DOM order, paints over the fallback. */
    .avatar {
      display: inline-grid;
      inline-size: 80px;
      block-size: 80px;
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
      background: #b45309;
      color: #ffffff;
      font: bold 14px sans-serif;
    }

    .inner {
      inline-size: 40px;
      block-size: 40px;
    }

    /* The README's delay recipe, scoped to one row so it doesn't delay the others' fallbacks. */
    [ogAvatar].delayed[data-status="loading"] > [ogAvatarFallback] {
      animation: avatar-fallback-delay 0s 600ms both;
    }

    @keyframes avatar-fallback-delay {
      from {
        visibility: hidden;
      }
    }
  `,
})
export class AvatarFixture {
  readonly clientRendered = isPlatformBrowser(inject(PLATFORM_ID)) || null;
  readonly attached = signal(false);

  readonly photo = "/avatar-image/photo.svg";
  readonly data = cyanData;
  readonly magenta = magentaData;
  readonly slow = "/avatar-image/slow.svg";
  readonly broken = "/avatar-image/broken.svg";
  readonly none = null;
  readonly empty = "";
  readonly viewBox = "/avatar-image/viewbox.svg";
  readonly named = "/avatar-image/named.svg";

  readonly changesA = "/avatar-image/changes-a.svg";
  readonly changesB = "/avatar-image/changes-b.svg";
  readonly changesBad = "/avatar-image/changes-bad.svg";
  readonly changesFailed = "/avatar-image/changes-failed.svg";
  readonly changesRace = "/avatar-image/changes-race.svg";
  readonly changesSource = signal<string | null>(this.changesA);

  readonly directB = "/avatar-image/direct-b.svg";
  /** M3: the direct-Options avatar's effective source, read by its replaced Options directly. */
  readonly directSource = signal<string | null>("/avatar-image/direct-a.svg");

  readonly removableSlow = "/avatar-image/removable-slow.svg";
  readonly imageMounted = signal(true);
  readonly removableSource = signal<string | null>(cyanData);

  readonly outerSource = signal<string | null>(null);
  readonly factorySource = signal<string | null>(null);
  readonly existingSource = signal<string | null>(null);

  readonly rootNamedPhoto = "/avatar-image/root-named.svg";
  readonly rootNamedBroken = "/avatar-image/root-named-broken.svg";
  readonly rootNamedSource = signal<string | null>(null);

  readonly delayHeld = "/avatar-image/delay-held.svg";
  readonly delayBroken = "/avatar-image/delay-broken.svg";
  readonly delaySource = signal<string | null>("/avatar-image/delay.svg");

  constructor() {
    if (this.clientRendered === null) {
      return;
    }

    window.readFixtureSource = () => this.directSource();

    // The first-pass probe: `earlyRead` runs before the `mixedReadWrite` phase of the same
    // after-render pass, where each Image reconciles, so every entry holds what that pass's
    // bindings wrote. It is created with the fixture, so under incremental hydration it first
    // runs in the block's hydration pass.
    afterEveryRender({
      earlyRead: () => {
        const passes = (window.avatarPasses ??= []);

        for (const root of document.querySelectorAll("acceptance-avatar-fixture [data-probe]")) {
          const image = root.querySelector(":scope > img");
          const fallback = root.querySelector(":scope > [ogavatarfallback]");

          passes.push({
            testid: root.getAttribute("data-testid") ?? "",
            status: root.getAttribute("data-status"),
            src: image?.getAttribute("src") ?? null,
            imageHidden: image?.getAttribute("hidden") ?? null,
            imageAriaHidden: image?.getAttribute("aria-hidden") ?? null,
            fallbackHidden: fallback?.getAttribute("hidden") ?? null,
            root,
            image,
            fallback,
          });
        }
      },
    });
  }
}
