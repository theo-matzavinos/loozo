# Avatar

An avatar is an image of a person or an entity with a fallback, such as initials or an icon, that shows while there's no loaded image. Origami tracks the image's status and hides whichever of the two shouldn't show; you own the markup, the stacking, size and shape, the image's `alt` and other native attributes, the fallback's content and any fallback delay. The server renders the real `<img src>`, so the browser loads and paints it before hydration, and an image already painted stays painted through it.

[src/avatar/profile-picture.ts](../snippets/src/avatar/profile-picture.ts "playground")

| Directive          | Configuration                                                              |
| ------------------ | -------------------------------------------------------------------------- |
| `ogAvatar`         | none; exposes `state` (`exportAs: "ogAvatar"`)                             |
| `ogAvatarImage`    | `src: string \| null \| undefined` (default `null`); a native `<img>` only |
| `ogAvatarFallback` | none; an HTML element                                                      |

```html
<span ogAvatar class="avatar">
  <span ogAvatarFallback aria-hidden="true">UA</span>
  <img ogAvatarImage [src]="user().photoUrl" alt="" />
</span>
```

`null`, `undefined` and `""` all mean "no image": the `<img>` gets no `src`, so nothing is requested, and the fallback shows. One Image per root.

Put the root and the fallback on HTML elements, usually `<span>`s. Origami hides with the HTML `hidden` attribute, which doesn't hide an `<svg>` or take it out of the accessibility tree, so an icon goes inside the fallback, not on it ([below](#initials-and-other-fallback-content)).

## Stack the parts

Both parts stay in the DOM. Put them in one grid cell so the image, later in DOM order, paints over the fallback:

```css
.avatar {
  display: grid;
  inline-size: 2.5rem;
  block-size: 2.5rem;
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

/* :not([hidden]): a display rule of yours outranks the browser's [hidden] { display: none }. */
.avatar > [ogAvatarFallback]:not([hidden]) {
  display: grid;
  place-items: center;
}
```

Origami hides with the `hidden` attribute: the fallback once the image has loaded, the image while there's no source or it failed. A `display` rule of yours on either part beats `[hidden]`, which would leave the fallback under a loaded image or a failed image's icon on top; scope it with `:not([hidden])` as above. Tailwind v4's preflight already gives `[hidden]` `display: none !important`.

The image is never hidden while it loads: it paints as soon as it has pixels, over the fallback, which stays visible underneath until then. A transparent or partly transparent image therefore shows the fallback through it while it loads, and before hydration. If that matters, give the image an opaque backdrop only once it has loaded, so the backdrop doesn't cover the fallback while it loads:

```css
.avatar[data-status="loaded"] > img {
  background: var(--surface);
}
```

## Initials and other fallback content

The fallback is your content: text, an icon, or initials you compute. An icon goes inside an HTML fallback element:

```html
<span ogAvatar class="avatar">
  <span ogAvatarFallback aria-hidden="true">
    <svg viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0z" />
    </svg>
  </span>
  <img ogAvatarImage [src]="user().photoUrl" alt="" />
</span>
```

Origami ships no initials helper, because splitting names well is locale- and script-dependent; write the rule your product needs:

```ts
@Component({
  selector: "app-user-avatar",
  imports: [OrigamiAvatar, OrigamiAvatarImage, OrigamiAvatarFallback],
  template: `
    <span ogAvatar class="avatar">
      <span ogAvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
      <img ogAvatarImage [src]="user().photoUrl" alt="" />
    </span>
  `,
})
export class UserAvatar {
  readonly user = input.required<{ name: string; photoUrl: string | null }>();

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
```

`[0]` takes one UTF-16 code unit, which is fine for the Latin, Greek and Cyrillic names it's written for; for other scripts or emoji, split with `Intl.Segmenter`.

## Reading the status

The root's status is `"idle"` (no source), `"loading"`, `"loaded"` or `"error"`. Read it three ways.

**In a template**, through the root's template reference:

```html
<span ogAvatar #avatar="ogAvatar" class="avatar">
  <span ogAvatarFallback aria-hidden="true">TM</span>
  <img ogAvatarImage [src]="photoUrl()" alt="" />
</span>
@if (avatar.state.status() === "error") {
<button type="button" (click)="reload()">Try again</button>
}
```

**For side effects**, with an `effect()` on the State. There's no output: the status is a signal. Get the State from a `viewChild` of the root (or `inject(OrigamiAvatarState)` in a directive that composes `ogAvatar`):

```ts
@Component({
  selector: "app-profile-header",
  imports: [OrigamiAvatar, OrigamiAvatarImage, OrigamiAvatarFallback],
  template: `
    <span ogAvatar class="avatar">
      <span ogAvatarFallback aria-hidden="true">TM</span>
      <img ogAvatarImage [src]="photoUrl()" alt="" />
    </span>
  `,
})
export class ProfileHeader {
  readonly photoUrl = input<string | null>(null);
  readonly brokenPhoto = output<string>();
  readonly avatar = viewChild.required(OrigamiAvatar);

  constructor() {
    effect(() => {
      const status = this.avatar().state.status();

      const photoUrl = untracked(this.photoUrl);

      if (status === "error" && photoUrl !== null) {
        this.brokenPhoto.emit(photoUrl);
      }
    });
  }
}
```

The status reads `"loading"` in the render that writes a new source, also when an earlier source comes back. If the browser still holds that image, it reads `"loaded"` again within the same tick, so an `effect()` may see `"loading"` then `"loaded"` with no paint in between. On the server and in the first hydrating render a source always reads `"loading"`, never `"loaded"`: the status after hydration is when the avatar was hydrated, not when its image loaded.

**In CSS**, through the root's `data-status`, which is also in the server's HTML:

```css
.avatar[data-status="error"] {
  outline: 1px dashed var(--danger);
}
```

## Delay the fallback

A fast or cached image can still take a frame or two to decode, and the fallback shows until it has. To avoid that flash, keep the fallback transparent for a short window while the image loads:

```css
/* Wait 600 ms before showing the fallback while the image is loading.
   CSS starts the clock when the element is first styled, so it also runs before hydration. */
[ogAvatar][data-status="loading"] > [ogAvatarFallback] {
  animation: avatar-fallback-delay 0s 600ms both;
}

@keyframes avatar-fallback-delay {
  from {
    opacity: 0;
  }
}
```

It delays only the paint, with `opacity`. Don't use `visibility: hidden` or `display: none`: they also take the fallback's text out of the accessibility tree, and while the image is loading it is `aria-hidden`, so an avatar named by its fallback text (see [Naming](#naming)) would have no name for the whole window.

It's a mitigation, not a guarantee: an image that takes longer than the window to load or decode still shows the fallback first. It applies only while `"loading"`, so a failed image shows the fallback at once, and an avatar without a source shows it at once too. The window restarts each time the fallback is shown again for a loading image, not once per source. It's CSS rather than an input because a timer can't run before hydration, while this clock runs in a block that hasn't hydrated yet.

## Naming

Exactly one of the image and the fallback is in the accessibility tree at a time: the image once it has loaded (Origami removes its `aria-hidden="true"` and hides the fallback), the fallback otherwise. Pick one of three patterns:

- **A named avatar**: the person's name as `alt` and as the fallback text, so it reads the same either way.

  ```html
  <span ogAvatar class="avatar">
    <span ogAvatarFallback>Theo Matzavinos</span>
    <img ogAvatarImage [src]="photoUrl()" alt="Theo Matzavinos" />
  </span>
  ```

- **A root-named avatar**: `role="img"` and `aria-label` on the root, and both parts decorative. The role is required: a `<span>` can't take an `aria-label` on its own.

  ```html
  <span ogAvatar role="img" aria-label="Theo Matzavinos" class="avatar">
    <span ogAvatarFallback aria-hidden="true">TM</span>
    <img ogAvatarImage [src]="photoUrl()" alt="" />
  </span>
  ```

- **A decorative avatar inside a named control**: `alt=""` and `aria-hidden="true"` on the fallback, and the control names itself.

  ```html
  <button type="button" aria-label="Account">
    <span ogAvatar class="avatar">
      <span ogAvatarFallback aria-hidden="true">UA</span>
      <img ogAvatarImage [src]="photoUrl()" alt="" />
    </span>
  </button>
  ```

Origami owns the image's `aria-hidden` and `hidden`: don't bind them yourself. Before its block hydrates, an avatar whose image has already painted is still exposed as its fallback text.

## Changing the source

A new `src` keeps the previous image's pixels until the new one has decoded: that's how the browser updates an `<img>`. The status is `"loading"` meanwhile, so the fallback is unhidden underneath. Going through `null` clears the pixels, because the image is hidden and its `src` removed.

If a reused avatar must never show one person's photo for another, re-create it per person, or clear the source between them:

```html
@for (id of [user().id]; track id) {
<span ogAvatar class="avatar">
  <span ogAvatarFallback aria-hidden="true">{{ initials(user().name) }}</span>
  <img ogAvatarImage [src]="user().photoUrl" alt="" />
</span>
}
```

Setting the source it already has doesn't retry a failed image: Angular doesn't rewrite an unchanged attribute. A rendered `null` in between does, because the attribute really is removed and set again; so does a cache-busting query string for an immediate retry. Only `src` is tracked: change `srcset` or `sizes` on their own and the status still follows `src`.

## Replacing Options

`OrigamiAvatarImageOptions` has `src`. A composing image directive supplies it as a signal, from an input of its own or any other source:

```ts
@Directive({
  selector: "img[appPhoto]",
  hostDirectives: [OrigamiAvatarImage],
  providers: [OrigamiAvatarImageOptions.provideFactory(() => ({ src: inject(AppPhoto).photo }))],
})
export class AppPhoto {
  readonly photo = input<string | null>(null);
}
```

A component can compose the root instead and render the Image in its own view; a Fallback projected into it finds that root:

```ts
@Component({
  selector: "app-avatar",
  hostDirectives: [OrigamiAvatar],
  imports: [OrigamiAvatarImage],
  template: `<ng-content /><img ogAvatarImage [src]="src()" [alt]="alt()" />`,
})
export class AppAvatar {
  readonly src = input<string | null | undefined>();
  readonly alt = input("");
}
// <app-avatar [src]="url"><span ogAvatarFallback>UA</span></app-avatar>
```

See [How the primitives fit together](../README.md#how-the-primitives-fit-together).

## State and attributes

`OrigamiAvatarState` has `status()`. The root exposes it as `state`, and its descendants can inject it.

| Element  | Attributes                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------- |
| Root     | `data-status`: `idle`, `loading`, `loaded` or `error`                                                   |
| Image    | `src` (absent without a source); `hidden` while `idle` or `error`; `aria-hidden="true"` unless `loaded` |
| Fallback | `hidden` while `loaded`                                                                                 |

The status is `"loaded"` once the browser has finished the current source with a nonzero `naturalWidth`, else `"error"`. An SVG with only a `viewBox` and no `width` loads in every engine the acceptance runs (Chromium and WebKit report a natural width of 150, Firefox 300).

## Server rendering and hydration

The server renders the `<img>` with its `src` and the fallback under it; `data-status` is `"loading"`, or `"idle"` without a source, never `"loaded"` or `"error"`, and the first hydrating render writes the same attributes. The browser requests and paints the image during HTML parse, and nothing in Origami or Angular holds it back. An image already painted when hydration runs, eager or incremental, stays painted, on the server's nodes. Whether a cached or data-URI image is painted at the very first paint is the browser's decode: bytes being available isn't pixels being decoded, which is what the delay recipe is for.

The parts have no Angular event listeners, so an image's `load` or `error` never hydrates an incremental block early. Once the Image has rendered in the browser, it reads its own element in the same tick. Because hydration writes `src` again (below), that doesn't always settle the status at once: in Firefox a loaded image settles on the `load` that follows hydration, a moment later, with its pixels unchanged; in Chromium and Firefox an image that had already failed stays `"loading"` until its retry finishes.

- **A failing server-rendered source** shows the browser's broken-image icon or border over the fallback until the avatar hydrates, and in Chromium and Firefox until the retry after hydration fails too; then the image is hidden and only the fallback is left.
- **Hydration writes the unchanged `src` attribute again**, as it does for any bound attribute, and browsers react to that write: Firefox marks even a loaded image as loading until it fires `load` again, requests an image that is still loading a second time, even a cacheable one (Chromium reuses the pending request), and Chromium and Firefox request an image that already failed once more, so a transient failure gets one retry. An image that has already loaded isn't requested again.
- **Keep an avatar's parts in one hydrate boundary.** An Image in its own `@defer` block that hasn't hydrated isn't registered: its root reads `"idle"`, with the fallback visible under the painted image, until that block hydrates. A Fallback in its own dormant block keeps its server attributes until it hydrates.

What holds for every primitive is in [Server rendering and hydration](../README.md#server-rendering-and-hydration).

## Not included

No status event, delay input, initials helper, image groups or "+N" overflow; no `srcset`- or `sizes`-only change tracking; no retry on request of an unchanged source (beyond the one the browser makes at hydration); no styles. `ngSrc` (NgOptimizedImage) can't share the `<img>`: `[src]` binds the Image's input.
