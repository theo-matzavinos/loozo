/**
 * Image loading status of an Avatar, as its root's `state.status` and `data-status` report it.
 *
 * - `"idle"`: no mounted Image, or its source is null or `""`: there is nothing to load, the
 *   Image is `hidden` and the Fallback shows.
 * - `"loading"`: the Image has a source the browser hasn't been observed to finish yet. The image
 *   is never hidden while loading, so it paints as soon as it has decoded pixels, over the
 *   Fallback, which stays unhidden underneath. On the server and in the first hydrating render a
 *   source always reads `"loading"`.
 * - `"loaded"`: the browser finished the current source with a decoded image (`complete` with a
 *   nonzero `naturalWidth`); the Fallback is `hidden`.
 * - `"error"`: the browser finished the current source without a decodable image; the Image is
 *   `hidden` and the Fallback shows.
 */
export type OrigamiAvatarStatus = "idle" | "loading" | "loaded" | "error";
