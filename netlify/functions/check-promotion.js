const { toNetlifyHandler } = require("./_adapt");
exports.handler = toNetlifyHandler(() => require("../../api/check-promotion"));
