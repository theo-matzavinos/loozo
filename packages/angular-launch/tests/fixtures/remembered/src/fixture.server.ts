import type { Schema } from "@loozo/angular-launch/server";

export interface FilterInput {
  readonly filter: string;
  readonly pageSize: number;
}

// Every stage and handler run, in order; the server serves them at /__proof/calls.
export const calls: { kind: string; page: string; filter?: string; refused?: boolean }[] = [];

export const filterSchema: Schema<FilterInput> = {
  "~standard": {
    version: 1,
    vendor: "fixture",
    validate(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        !("filter" in value) ||
        typeof value.filter !== "string" ||
        !("pageSize" in value) ||
        typeof value.pageSize !== "number"
      ) {
        return { issues: [{ message: "Filter and page size required" }] };
      }

      return { value: { filter: value.filter, pageSize: value.pageSize } };
    },
  },
};
