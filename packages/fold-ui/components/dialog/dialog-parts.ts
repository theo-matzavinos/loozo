import { Dialog } from "./dialog";
import { DialogBody } from "./dialog-body";
import { DialogClose } from "./dialog-close";
import { DialogContent } from "./dialog-content";
import { DialogDescription } from "./dialog-description";
import { DialogFooter } from "./dialog-footer";
import { DialogHeader } from "./dialog-header";
import { DialogTitle } from "./dialog-title";
import { DialogTrigger } from "./dialog-trigger";

/** Every Dialog part, for a component's `imports`. */
export const DialogParts = [
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
] as const;
