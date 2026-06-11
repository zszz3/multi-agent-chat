import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, loadStoredTheme } from "./App";
import "./styles.css";

document.documentElement.dataset.theme = loadStoredTheme(window.localStorage);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
