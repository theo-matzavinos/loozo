export function createFieldsProxy<T>(): { [K in keyof NonNullable<T>]: K } {
  return new Proxy(
    {},
    {
      get(_, key) {
        return key;
      },
    },
  ) as never;
}
