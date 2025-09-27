import React from "react";
import { createRoot } from "react-dom/client";
import App from "./routes/App.jsx"; // ← asegúrate que este es el archivo correcto
import "./index.css";
import "./styles/theme.css"; 

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
