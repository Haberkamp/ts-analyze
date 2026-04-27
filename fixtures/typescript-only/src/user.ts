import type { User } from "./types.js";

export function getUser(id: string): User {
  return {
    id,
    firstName: "Ada",
    lastName: "Lovelace",
  };
}
