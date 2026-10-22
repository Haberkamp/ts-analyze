const direct = require("./direct");
function lazy() { return require("./lazy.js"); }
const templated = require(`./templated`);
const name = "./dynamic";
const dynamic = require(name);
const resolvedPath = require.resolve("./resolved-only.js");
module.exports = require("./reexported");
