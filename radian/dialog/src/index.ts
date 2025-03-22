import { RadianDialog } from './lib/dialog';
import { RadianDialogClose } from './lib/dialog-close';
import { RadianDialogContent } from './lib/dialog-content';
import { RadianDialogDescription } from './lib/dialog-description';
import { RadianDialogOverlay } from './lib/dialog-overlay';
import { RadianDialogPortal } from './lib/dialog-portal';
import { RadianDialogPortalPresence } from './lib/dialog-portal-presence';
import { RadianDialogTitle } from './lib/dialog-title';
import { RadianDialogTrigger } from './lib/dialog-trigger';

export const RadianDialogContentImports = [
  RadianDialogPortal,
  RadianDialogPortalPresence,
  RadianDialogOverlay,
  RadianDialogContent,
  RadianDialogTitle,
  RadianDialogDescription,
  RadianDialogClose,
] as const;

export const RadianDialogImports = [
  ...RadianDialogContentImports,
  RadianDialog,
  RadianDialogTrigger,
] as const;

export {
  RadianDialog,
  RadianDialogDefaults,
  provideRadianDialogDefaults,
} from './lib/dialog';
export { RadianDialogClose } from './lib/dialog-close';
export { RadianDialogContent } from './lib/dialog-content';
export { RadianDialogDescription } from './lib/dialog-description';
export { RadianDialogOverlay } from './lib/dialog-overlay';
export { RadianDialogPortal, RadianDialogRef } from './lib/dialog-portal';
export { RadianDialogPortalPresence } from './lib/dialog-portal-presence';
export { RadianDialogTitle } from './lib/dialog-title';
export { RadianDialogTrigger } from './lib/dialog-trigger';
export { injectRadianDialog } from './lib/dynamic-dialog';
