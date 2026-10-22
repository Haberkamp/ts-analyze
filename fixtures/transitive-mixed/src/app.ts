import { service } from "./service.js";
import { util } from "./util.js";

export function app(): string {
  return service() + util;
}
