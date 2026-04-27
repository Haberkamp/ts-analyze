import { countItems } from "./utils/count.js";
import { titleCase } from "./utils/title.js";

export function buildSummary(items) {
  return `${titleCase("items")}: ${countItems(items)}`;
}
