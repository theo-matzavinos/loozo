import { AccordionHeader } from "./accordion-header";
import { AccordionIndicator } from "./accordion-indicator";
import { AccordionItem } from "./accordion-item";
import { AccordionMultiple } from "./accordion-multiple";
import { AccordionPanel } from "./accordion-panel";
import { AccordionSingle } from "./accordion-single";
import { AccordionTrigger } from "./accordion-trigger";

export const AccordionParts = [
  AccordionSingle,
  AccordionMultiple,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionIndicator,
  AccordionPanel,
] as const;
