import { Sheet } from "./sheet";
import { SheetBody } from "./sheet-body";
import { SheetClose } from "./sheet-close";
import { SheetContent } from "./sheet-content";
import { SheetDescription } from "./sheet-description";
import { SheetFooter } from "./sheet-footer";
import { SheetHeader } from "./sheet-header";
import { SheetTitle } from "./sheet-title";
import { SheetTrigger } from "./sheet-trigger";

/** Every Sheet part, for a component's `imports`. */
export const SheetParts = [
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetBody,
  SheetFooter,
  SheetClose,
] as const;
