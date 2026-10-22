import { query } from "./legacy/db.js";

export function service(): string {
  return query();
}
