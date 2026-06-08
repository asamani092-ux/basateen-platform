import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import App from "./app/App";
import { AuthProvider } from "./app/context/AuthContext";
import "react-day-picker/dist/style.css";
import "./styles/index.css";
import { initTheme } from "./app/lib/theme-mode";
import { Toaster } from "./app/components/ui/sonner";

initTheme();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
      <Toaster position="top-center" dir="rtl" richColors closeButton />
    </AuthProvider>
  </BrowserRouter>,
);
