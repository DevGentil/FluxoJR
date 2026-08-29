"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMounted } from "@/hooks/use-mounted";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema resolvido só existe no browser: renderizar o ícone antes de
  // hidratar daria divergência entre servidor e cliente.
  const mounted = useMounted();

  if (!mounted) {
    return <Button variant="ghost" size="icon" disabled className="size-8" />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
