import Keycloak from "keycloak-js";

const keycloak = new Keycloak({
  url: "http://localhost:8080/",
  realm: "framesync",
  clientId: "framesync-client-public", // public client for frontend
});

export default keycloak;
