import type { User } from "./types.js";

export function greet(user: User): string {
  return user.name;
}
