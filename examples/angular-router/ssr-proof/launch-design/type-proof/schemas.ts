import type { Schema } from "@loozo/angular-launch/server";

export const titleSchema: Schema<string, { title: string }> = {
  "~standard": {
    version: 1,
    vendor: "launch-design-proof",
    async validate(value) {
      if (typeof value !== "string" || value.trim().length === 0) {
        return { issues: [{ message: "A title is required" }] };
      }

      return { value: { title: value.trim() } };
    },
  },
};

export const idSchema: Schema<{ id: string }, { id: string }> = {
  "~standard": {
    version: 1,
    vendor: "launch-design-proof",
    validate(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        typeof value.id !== "string"
      ) {
        return { issues: [{ message: "An id is required" }] };
      }

      return { value: { id: value.id } };
    },
  },
};
