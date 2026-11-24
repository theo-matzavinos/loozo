import { Page } from "./page";
import { PageActions } from "./page-actions";
import { PageDescription } from "./page-description";
import { PageHeader } from "./page-header";
import { PageTitle } from "./page-title";

/** Every Page part, for a component's `imports`. */
export const PageParts = [Page, PageHeader, PageTitle, PageDescription, PageActions] as const;
