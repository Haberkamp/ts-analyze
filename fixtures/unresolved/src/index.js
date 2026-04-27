import leftPad from "left-pad";
import { existing } from "./existing.js";
import { missing } from "./missing.js";

export const value = leftPad(existing + missing, 10);
