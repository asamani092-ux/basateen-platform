import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import App from "./app/App";
import { AuthProvider } from "./app/context/AuthContext";
import { queryClient } from "./app/lib/query-client";
import "react-day-picker/dist/style.css";
import "./styles/index.css";
import { initTheme } from "./app/lib/theme-mode";
import { Toaster } from "./app/components/ui/sonner";

initTheme();

createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
        <Toaster position="top-center" dir="rtl" richColors closeButton />
      </AuthProvider>
    </QueryClientProvider>
  </BrowserRouter>,
);
