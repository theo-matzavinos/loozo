import { numberParam, type ParamCodec } from "@loozo/angular-router";

/** The page sizes the todos list offers. */
export const pageSizes: readonly number[] = [10, 20, 50];

/**
 * A page size the list offers. Any other value, typed or remembered, is invalid: it reads as
 * the fallback, and a commit forgets it instead of remembering it.
 */
export const pageSizeParam: ParamCodec<number> = {
  parse(raw) {
    const size = numberParam.parse(raw);

    if (!pageSizes.includes(size)) {
      throw new RangeError(`Unsupported page size: ${raw}`);
    }

    return size;
  },
  stringify: (size) => numberParam.stringify(size),
};
