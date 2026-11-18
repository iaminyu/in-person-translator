// The translation core: everything needed to turn one spoken sentence into
// its translation with your own API key. No accounts, billing or web server.

module.exports = {
  ...require("./shared"),
  ...require("./instructions"),
  ...require("./languages"),
  ...require("./gemini-live"),
  ...require("./openai-realtime"),
  ...require("./read-aloud")
};
