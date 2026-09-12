import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PassPage from "../pages/public/PassPage";
import "./index.css";

// Phase 2 — public pass pages (/v/:token visitor, /g/:token guide) live
// OUTSIDE the login-gated app entirely. No router library is installed
// in this project, so this is a minimal pathname check before App ever
// mounts — App.jsx and everything under it is completely unaware these
// routes exist. Requires a Render static-site rewrite (/* -> /index.html)
// so a fresh (non-client-nav) load of /v/<token> doesn't 404.
const pathMatch = window.location.pathname.match(/^\/(v|g)\/(.+)$/);
const publicToken = pathMatch ? pathMatch[2] : null;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {publicToken ? <PassPage token={publicToken} /> : <App />}
  </React.StrictMode>
);