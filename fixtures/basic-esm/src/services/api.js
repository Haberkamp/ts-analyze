import { add } from "../utils/math.js";

export function fetchUser(id) {
  return {
    id,
    name: `User ${add(1, 2)}`,
    createdAt: new Date("2026-01-01"),
  };
}
