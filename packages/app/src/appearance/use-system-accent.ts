import { useEffect, useState } from "react";
import { getDesktopHost } from "@/desktop/host";

/** macOS desktop only. Other platforms keep the theme's own accent. */
export function useSystemAccentColor(): string | null {
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    const host = getDesktopHost();
    const bridge = host?.platform === "darwin" ? host.accent : undefined;
    if (!bridge?.get) return undefined;

    let cancelled = false;
    void bridge.get().then((color) => {
      if (!cancelled) setAccent(color);
      return undefined;
    });
    const unsubscribe = bridge.onChange?.((color) => {
      setAccent(color);
    });

    return () => {
      cancelled = true;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  return accent;
}
