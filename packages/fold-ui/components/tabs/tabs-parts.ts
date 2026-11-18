import { Tabs } from "./tabs";
import { TabsList } from "./tabs-list";
import { TabsPanel } from "./tabs-panel";
import { TabsTrigger } from "./tabs-trigger";

/** Every Tabs part, for a component's `imports`. */
export const TabsParts = [Tabs, TabsList, TabsTrigger, TabsPanel] as const;
