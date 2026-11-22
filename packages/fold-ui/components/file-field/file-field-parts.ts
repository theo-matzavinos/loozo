import { FileField } from "./file-field";
import { FileFieldButton } from "./file-field-button";
import { FileFieldClear } from "./file-field-clear";
import { FileFieldDropZone } from "./file-field-drop-zone";
import { FileFieldInput } from "./file-field-input";
import { FileFieldValue } from "./file-field-value";

/** Every FileField part, for a component's `imports`. */
export const FileFieldParts = [
  FileField,
  FileFieldInput,
  FileFieldButton,
  FileFieldDropZone,
  FileFieldValue,
  FileFieldClear,
] as const;
