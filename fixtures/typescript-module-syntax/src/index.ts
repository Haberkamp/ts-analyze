import legacy = require("./legacy-require");
import type { Options } from "./legacy-types.js";
export type { Shape } from "./legacy-shapes.js";
export type Config = typeof import("./legacy-config.js");

export const value: Options = legacy;
