import type { Toggle } from "../src/index.js";

export function main(toggle: Toggle): void {
  // #region setup
  if (toggle.checked()) {
    toggle.toggle();
  }
  // #endregion setup
}
