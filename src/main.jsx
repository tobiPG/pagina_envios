import React from "react";
import { createRoot } from "react-dom/client";
import App from "./app/router/AppRouter.jsx"; // ← Router principal corregido
import "./index.css";
import "./styles/theme.css"; 

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
