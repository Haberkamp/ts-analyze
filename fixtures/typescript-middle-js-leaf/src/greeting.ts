import { punctuation } from "./punctuation.js";

export function makeGreeting(name: string): string {
  return `Hello ${name}${punctuation}`;
}
