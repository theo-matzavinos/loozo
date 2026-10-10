type ValidName<Name extends string> = Name extends
  | ""
  | "__proto__"
  | `...${string}`
  | `${string}?${string}`
  | `${string}*${string}`
  | `${string}[]${string}`
  ? false
  : true;
type SegmentValid<Segment extends string> = Segment extends `$${infer Name}`
  ? ValidName<Name>
  : Segment extends "" | "." | ".." | "*" | "**" | `:${string}`
    ? false
    : true;
type ValidateSegments<
  Path extends string,
  Scalars extends string = never,
> = Path extends `${infer Head}/${infer Tail}`
  ? Head extends `$${string}[]`
    ? false
    : SegmentValid<Head> extends true
      ? ValidateSegments<Tail, Scalars | ScalarName<Head>>
      : false
  : Path extends `$${infer Name}[]`
    ? ValidName<Name> extends true
      ? Name extends Scalars
        ? false
        : true
      : false
    : SegmentValid<Path>;
export type ValidPath<Path extends string> = string extends Path
  ? never
  : Path extends ""
    ? Path
    : ValidateSegments<Path> extends true
      ? Path
      : never;
type ScalarName<Segment extends string> = Segment extends `$${infer Name}` ? Name : never;
type SegmentName<Segment extends string> = Segment extends `$${infer Name}[]`
  ? Name
  : ScalarName<Segment>;
export type PathNames<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? SegmentName<Head> | PathNames<Tail>
  : SegmentName<Path>;
export type CatchallName<Path extends string> = Path extends `${string}/${infer Tail}`
  ? CatchallName<Tail>
  : Path extends `$${infer Name}[]`
    ? Name
    : never;

export type Segment =
  | { readonly kind: "static"; readonly text: string }
  | { readonly kind: "scalar" | "catchall"; readonly name: string };

export function parsePath(path: unknown): readonly Segment[] {
  if (typeof path !== "string") {
    throw new TypeError("Path must be a string");
  }

  if (path === "") {
    return Object.freeze([]);
  }

  const segments: Segment[] = [];
  const scalarNames = new Set<string>();
  const parts = path.split("/");

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];

    if (part.startsWith("$")) {
      let name = part.slice(1);
      let kind: "scalar" | "catchall" = "scalar";

      if (name.endsWith("[]")) {
        name = name.slice(0, -2);
        kind = "catchall";
      }

      if (
        name === "" ||
        name === "__proto__" ||
        name.startsWith("...") ||
        name.includes("?") ||
        name.includes("*") ||
        name.includes("[]")
      ) {
        throw new TypeError(`Invalid parameter name: ${name}`);
      }

      if (kind === "catchall" && (index !== parts.length - 1 || scalarNames.has(name))) {
        throw new TypeError("Catchall must be terminal and cannot repeat a scalar name");
      }

      scalarNames.add(name);
      segments.push(Object.freeze({ kind, name }));
    } else {
      if (
        part === "" ||
        part === "." ||
        part === ".." ||
        part === "*" ||
        part === "**" ||
        part.startsWith(":")
      ) {
        throw new TypeError(`Invalid static segment: ${part}`);
      }

      if (!part.isWellFormed()) {
        throw new TypeError("Static path Unicode must be well formed");
      }

      segments.push(Object.freeze({ kind: "static", text: part }));
    }
  }

  return Object.freeze(segments);
}
