import { useEffect, useState } from "react";

export default function ThemeSwitch(){
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme === "dark" ? "dark" : "light");
    localStorage.setItem("theme", theme);
  }, [theme]);
  return (
    <button className="btn" onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Tema">
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
