import {
  cnMerge,
  createTV,
  type CnOptions,
  type CnReturn,
  type TWMergeConfig,
} from "tailwind-variants";

/**
 * Teaches the class merger theme.css's text sizes, radii and shadows, which Tailwind's defaults
 * don't have: without them `text-title` counts as a text color and cancels `text-foreground`.
 * Adding a `--text-*`, `--radius-*` or `--shadow-*` to theme.css means adding its name here.
 */
export const twMergeConfig: TWMergeConfig = {
  extend: {
    theme: {
      text: ["display", "headline", "title", "body", "label"],
      radius: [
        "checkbox",
        "option",
        "segment",
        "control-sm",
        "control",
        "menu",
        "surface",
        "dialog",
      ],
      shadow: ["edge", "pressed", "popover", "dialog"],
    },
  },
};

/** tailwind-variants' `tv`, merging with theme.css's names. */
export const tv = createTV({ twMergeConfig });

/** Joins classes and merges conflicting utilities, the last one winning, with theme.css's names. */
export function cn(...classes: CnOptions): CnReturn {
  return cnMerge(...classes)({ twMergeConfig });
}
