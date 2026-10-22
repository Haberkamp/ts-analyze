import { connect } from "./conn.js";

export function query() {
  return connect();
}
