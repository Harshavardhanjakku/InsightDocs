const Keycloak = require('keycloak-connect');
const session = require('express-session');
const dotenv = require('dotenv');

dotenv.config();

let _keycloak;
const memoryStore = new session.MemoryStore();

function initKeycloak() {
  if (_keycloak) {
    console.warn("Trying to init Keycloak again!");
    return _keycloak;
  } else {
    console.log("Initializing Keycloak...");
    _keycloak = new Keycloak({ store: memoryStore }, {
      "realm": process.env.KEYCLOAK_REALM || "framesync",
      "auth-server-url": process.env.KEYCLOAK_SERVER_URL || "http://localhost:8080",
      "ssl-required": "external",
      "resource": process.env.KEYCLOAK_CLIENT_ID || "framesync-client-public",
      "bearer-only": false,
      "public-client": true,
      "confidential-port": 0
    });
    return _keycloak;
  }
}

function getKeycloak() {
  if (!_keycloak) {
    console.error("Keycloak has not been initialized. Call initKeycloak first.");
    return null;
  }
  return _keycloak;
}

module.exports = {
  initKeycloak,
  getKeycloak,
  memoryStore
};
