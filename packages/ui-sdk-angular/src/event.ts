/**
 * What a two-argument core callback emits as one output event: its value and its details.
 *
 * @example
 * ```ts
 * guard({ value, details }: UiSdkEvent<NonNullable<SelectOptions<string>["onValueChange"]>>) {
 *   if (value === null) {
 *     details.cancel();
 *   }
 * }
 * ```
 */
export type UiSdkEvent<C extends (value: any, details: any) => unknown> = {
  readonly value: Parameters<C>[0];
  readonly details: Parameters<C>[1];
};
