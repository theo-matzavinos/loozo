import type { Schema } from "@loozo/angular-launch/server";

export interface TitleInput {
  readonly title: string;
}

export interface IdInput {
  readonly id: string;
}

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
        return { issues: [{ message: "Title required" }] };
      }

      const title = value.title.trim();

      if (title.length < 1 || title.length > 200) {
        return { issues: [{ message: "Title must contain 1–200 characters" }] };
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
        return { issues: [{ message: "Todo id required" }] };
      }

      return { value: { id: value.id } };
    },
  },
};
