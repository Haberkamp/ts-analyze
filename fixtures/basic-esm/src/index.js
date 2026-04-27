import { renderButton } from "./components/Button.js";
import { fetchUser } from "./services/api.js";

export function start() {
  return renderButton(fetchUser("123"));
}
