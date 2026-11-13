import { BrowserWindow, ipcMain, systemPreferences } from "electron";

function readSystemAccentColor(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const color = systemPreferences.getAccentColor();
    return typeof color === "string" && color.trim().length > 0 ? color : null;
  } catch {
    return null;
  }
}

function publishSystemAccentColor(): void {
  const color = readSystemAccentColor();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    win.webContents.send("paseo:accent:changed", color);
  }
}

/** Forwards the macOS system accent to the renderer, including later changes. */
export function registerSystemAccent(): void {
  if (process.platform !== "darwin") return;
  ipcMain.handle("paseo:accent:get", () => readSystemAccentColor());
  systemPreferences.on("accent-color-changed", () => {
    publishSystemAccentColor();
  });
}
