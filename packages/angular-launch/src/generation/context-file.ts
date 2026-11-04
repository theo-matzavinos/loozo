import type { GenerationSession } from "./index.js";

// The context file each session's last pass discovered, for the serve builder's watcher. Internal:
// the exports map doesn't reach this module, so it isn't public API.
export const contextFiles = new WeakMap<GenerationSession, string>();
