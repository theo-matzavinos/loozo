import type { ParamCodec } from "@loozo/angular-router";

export const delayedNumber: ParamCodec<number> = {
  parse(raw) {
    return new Promise<number>((resolve, reject) => {
      setTimeout(() => {
        const value = Number(raw);

        if (!raw.trim() || !Number.isFinite(value)) {
          reject(new Error("invalid number"));

          return;
        }

        resolve(value);
      }, 75);
    });
  },
  stringify(value) {
    return String(value);
  },
};
