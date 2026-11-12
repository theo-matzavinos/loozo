import type { Schema } from "@loozo/angular-launch/server";

export const idSchema: Schema<{ id: string }> = {
  "~standard": {
    version: 1,
    vendor: "snippets",
    validate(value) {
      if (typeof value === "object" && value !== null && "id" in value) {
        const { id } = value;

        if (typeof id === "string") {
          return { value: { id } };
        }
      }

      return { issues: [{ message: "Expected a todo id", path: ["id"] }] };
    },
  },
};
