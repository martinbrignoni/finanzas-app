import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthGate } from "./features/auth/AuthGate";
import "./styles/index.css";

// Registra el service worker (necesario para poder recibir notificaciones
// push). No falla la app si el navegador no lo soporta o si algo sale mal:
// las notificaciones simplemente no van a estar disponibles.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/finanzas-app/sw.js").catch((err) => {
      console.error("No se pudo registrar el service worker.", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </React.StrictMode>
);
