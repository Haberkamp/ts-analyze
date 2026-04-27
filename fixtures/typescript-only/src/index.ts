import { createReport } from "./report.js";
import { getUser } from "./user.js";

export function main(): string {
  return createReport(getUser("123"));
}
