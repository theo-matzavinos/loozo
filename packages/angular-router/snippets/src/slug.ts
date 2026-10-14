import type { ParamCodec } from "@loozo/angular-router";

export const slug: ParamCodec<string> = {
  parse(raw) {
    if (!/^[a-z0-9-]+$/.test(raw)) {
      throw new Error("invalid slug");
    }

    return raw;
  },
  stringify(value) {
    return value;
  },
};
