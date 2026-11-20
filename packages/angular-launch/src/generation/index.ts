// The public `@loozo/angular-launch/generation` entry. The builders use run.ts directly, whose
// calls also resolve to the locale words.
export { generate, createGenerationSession } from "./run.js";
export type { GenerationOptions, GenerationSession } from "./run.js";
