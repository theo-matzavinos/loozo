import { Empty } from "./empty";
import { EmptyActions } from "./empty-actions";
import { EmptyDescription } from "./empty-description";
import { EmptyTitle } from "./empty-title";

/** Every Empty part, for a component's `imports`. */
export const EmptyParts = [Empty, EmptyTitle, EmptyDescription, EmptyActions] as const;
