import type { User } from "./types.js";
import { formatName } from "./format.js";

export function createReport(user: User): string {
  return `Report for ${formatName(user)}`;
}
