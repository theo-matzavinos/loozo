import { Avatar } from "./avatar";
import { AvatarFallback } from "./avatar-fallback";
import { AvatarImage } from "./avatar-image";

/** Every Avatar part, for a component's `imports`. */
export const AvatarParts = [Avatar, AvatarImage, AvatarFallback] as const;
