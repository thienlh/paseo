import { getIsElectron, isWeb } from "@/constants/platform";
import { getDesktopHost } from "@/desktop/host";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("error", () =>
      reject(reader.error ?? new Error("Unable to read image data")),
    );
    reader.addEventListener("load", () => resolve(String(reader.result)));
    reader.readAsDataURL(blob);
  });
}

async function toPngClipboardBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to convert the image to PNG");
    context.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((png) => {
        if (png) resolve(png);
        else reject(new Error("Unable to convert the image to PNG"));
      }, "image/png");
    });
  } finally {
    bitmap.close();
  }
}

export async function copyProviderImageToClipboard(uri: string): Promise<void> {
  if (!isWeb) throw new Error("Image clipboard is unavailable on this platform");
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Unable to read the image");
  const blob = await toPngClipboardBlob(await response.blob());

  if (getIsElectron()) {
    const copyElement = getDesktopHost()?.browser?.copyElement;
    if (copyElement) {
      const imageDataUrl = await blobToDataUrl(blob);
      if (await copyElement({ imageDataUrl })) return;
      throw new Error("Unable to copy the image");
    }
  }

  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return;
  }
  throw new Error("Image clipboard is unavailable in this browser");
}
