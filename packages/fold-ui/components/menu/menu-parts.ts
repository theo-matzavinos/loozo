import { Menu } from "./menu";
import { MenuCheckboxItem } from "./menu-checkbox-item";
import { MenuContent } from "./menu-content";
import { MenuGroup } from "./menu-group";
import { MenuGroupLabel } from "./menu-group-label";
import { MenuItem } from "./menu-item";
import { MenuLink } from "./menu-link";
import { MenuRadioGroup } from "./menu-radio-group";
import { MenuRadioItem } from "./menu-radio-item";
import { MenuSeparator } from "./menu-separator";
import { MenuShortcut } from "./menu-shortcut";
import { MenuSub } from "./menu-sub";
import { MenuSubTrigger } from "./menu-sub-trigger";
import { MenuTrigger } from "./menu-trigger";

/** Every Menu part, for a component's `imports`. */
export const MenuParts = [
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuLink,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuShortcut,
] as const;
