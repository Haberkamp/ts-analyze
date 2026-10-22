import { feature } from "./feature.js";
import { a } from "./a.js";

export async function load(name) {
  return [feature, a, await import(name)];
}
