type StyleOverride = {
  readonly property: string;
  temporary: string;
  value: string;
  priority: string;
};

/** Owner-private specified-value overrides that keep prepared Content transparent and non-interactive. */
export class FloatingPreparation {
  readonly #preparationId: string;
  #overrides: StyleOverride[] = [];

  constructor(preparationId: string) {
    this.#preparationId = preparationId;
  }

  prepare(element: HTMLElement): void {
    if (this.#overrides.length === 0) {
      const opacityVariable = `--${this.#preparationId}-opacity`;
      const pointerVariable = `--${this.#preparationId}-pointer`;

      // Owner-private declarations block inherited values. Track them through the
      // same restoration protocol; their names are not application styling hooks.
      // Distinct specified tokens still compute to 0/none, so ordinary authored
      // 0!important / none!important cannot be mistaken for our own override.
      this.#overrides = [
        {
          property: opacityVariable,
          temporary: "0",
          value: element.style.getPropertyValue(opacityVariable),
          priority: element.style.getPropertyPriority(opacityVariable),
        },
        {
          property: pointerVariable,
          temporary: "none",
          value: element.style.getPropertyValue(pointerVariable),
          priority: element.style.getPropertyPriority(pointerVariable),
        },
        {
          property: "opacity",
          temporary: `var(${opacityVariable}, 0)`,
          value: element.style.getPropertyValue("opacity"),
          priority: element.style.getPropertyPriority("opacity"),
        },
        {
          property: "pointer-events",
          temporary: `var(${pointerVariable}, none)`,
          value: element.style.getPropertyValue("pointer-events"),
          priority: element.style.getPropertyPriority("pointer-events"),
        },
      ];
    }

    for (const override of this.#overrides) {
      const value = element.style.getPropertyValue(override.property);
      const priority = element.style.getPropertyPriority(override.property);

      if (value !== override.temporary || priority !== "important") {
        override.value = value;
        override.priority = priority;
      }

      element.style.setProperty(override.property, override.temporary, "important");
      // Ownership compares the browser's specified serialization, never computed values.
      override.temporary = element.style.getPropertyValue(override.property);
    }
  }

  release(element: HTMLElement): void {
    // Restore visual declarations before releasing their private variable dependencies.
    for (let index = this.#overrides.length - 1; index >= 0; index--) {
      const override = this.#overrides[index];

      // A consumer binding written after our override is authoritative. Otherwise
      // restore the latest binding captured in preparation, including its priority.
      if (
        element.style.getPropertyValue(override.property) === override.temporary &&
        element.style.getPropertyPriority(override.property) === "important"
      ) {
        if (override.value === "") {
          element.style.removeProperty(override.property);
        } else {
          element.style.setProperty(override.property, override.value, override.priority);
        }
      }
    }

    this.#overrides = [];
  }
}
