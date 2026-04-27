const { upper } = require("./text");

exports.makeMessage = function makeMessage(value) {
  return `Hello ${upper(value)}`;
};
