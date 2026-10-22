// import "./commented.js";
/* const blocked = require("./block-commented.js"); */
const text = 'import "./in-string.js"';
const template = `require("./in-template.js")`;
import { real } from "./real.js";

export const value = [text, template, real];
