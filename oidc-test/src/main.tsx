import React from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "react-oidc-context";
import App from "./App";

// Enter your OAuth OpenId Connect issuer info below! 

const oidcConfig = {
  authority: "", // OpenId Connect Authority URI - example for google: https://accounts.google.com
  client_id: "", // ClientId - example for google would be like... asdfasdfasdfasdfasdfasdf.apps.googleusercontent.com
  disablePKCE: true, // disable PKCE so we don't need a secret
  code_challenge_method: "S256", // doesn't apply to everything, force RS256
  redirect_uri: "http://localhost:5173/callback", // Our callback URL which will catch the token from google
  post_logout_redirect_uri: "http://localhost:5173", // Where we want to redirect back (our homepage)
  response_type: "code", // Required
  scope: "openid email profile", // Minimal applicable scopes
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider {...oidcConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
