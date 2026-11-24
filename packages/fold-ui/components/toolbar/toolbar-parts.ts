import { Toolbar } from "./toolbar";
import { ToolbarSeparator } from "./toolbar-separator";
import { ToolbarButton } from "./toolbar-button";
import { ToolbarToggle } from "./toolbar-toggle";
import { ToolbarToggleGroupSingle } from "./toolbar-toggle-group-single";
import { ToolbarToggleGroupMultiple } from "./toolbar-toggle-group-multiple";
import { ToolbarRadioGroup } from "./toolbar-radio-group";
import { ToolbarPopoverTrigger } from "./toolbar-popover-trigger";
import { ToolbarMenuTrigger } from "./toolbar-menu-trigger";

export const ToolbarParts = [
  Toolbar,
  ToolbarSeparator,
  ToolbarButton,
  ToolbarToggle,
  ToolbarToggleGroupSingle,
  ToolbarToggleGroupMultiple,
  ToolbarRadioGroup,
  ToolbarPopoverTrigger,
  ToolbarMenuTrigger,
] as const;
