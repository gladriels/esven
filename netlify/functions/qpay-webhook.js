const { toNetlifyHandler } = require("./_adapt");
exports.handler = toNetlifyHandler(() => require("../../api/qpay-webhook"));
