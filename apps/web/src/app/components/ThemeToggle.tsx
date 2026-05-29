import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "./ui/button";
import { ds, tajawal } from "../lib/design-system";
import { getThemeMode, initTheme, toggleThemeMode } from "../lib/theme-mode";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    initTheme();
    setDark(getThemeMode() === "dark");
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={ds.btnRound}
      title={dark ? "الوضع النهاري" : "الوضع الليلي"}
      aria-label={dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي"}
      onClick={() => setDark(toggleThemeMode() === "dark")}
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      <span className="sr-only" style={tajawal}>
        {dark ? "نهاري" : "ليلي"}
      </span>
    </Button>
  );
}
