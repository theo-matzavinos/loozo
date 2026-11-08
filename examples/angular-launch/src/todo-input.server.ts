import type { Schema } from "@loozo/angular-launch/server";

export interface TitleInput {
  readonly title: string;
}

export interface IdInput {
  readonly id: string;
}

// The length a trimmed title must have; the about page publishes it.
export const titleLength = { min: 1, max: 200 };

export const titleSchema: Schema<TitleInput> = {
  "~standard": {
    version: 1,
    vendor: "todos",
    validate(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("title" in value) ||
        typeof value.title !== "string"
      ) {
        return { issues: [{ message: "Title required", path: ["title"] }] };
      }

      const title = value.title.trim();

      if (title.length < titleLength.min || title.length > titleLength.max) {
        return {
          issues: [
            {
              message: `Title must contain ${titleLength.min}–${titleLength.max} characters`,
              path: ["title"],
            },
          ],
        };
      }

      return { value: { title } };
    },
  },
};

export const idSchema: Schema<IdInput> = {
  "~standard": {
    version: 1,
    vendor: "todos",
    async validate(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        typeof value.id !== "string"
      ) {
        return { issues: [{ message: "Todo id required", path: ["id"] }] };
      }

      return { value: { id: value.id } };
    },
  },
};
