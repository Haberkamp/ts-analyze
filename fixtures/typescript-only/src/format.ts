import type { User } from "./types.js";

export function formatName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}
