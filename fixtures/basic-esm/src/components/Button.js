import { formatDate } from "../utils/date.js";

export function renderButton(user) {
  return `<button>${user.name} - ${formatDate(user.createdAt)}</button>`;
}
