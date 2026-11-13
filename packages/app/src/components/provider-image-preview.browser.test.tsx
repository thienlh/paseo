import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { ProviderImagePreview } from "./provider-image-preview";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

let root: Root;
let host: HTMLDivElement;
let queryClient: QueryClient;

beforeEach(async () => {
  await i18n.changeLanguage("en");
  queryClient = new QueryClient();
  host = document.createElement("div");
  host.style.width = "600px";
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  host.remove();
});

it("paints a bounded image and opens the lightbox", async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ProviderImagePreview source={PIXEL} alt="Screenshot" />
      </QueryClientProvider>,
    );
  });

  await expect.poll(() => host.querySelector("img")?.naturalWidth).toBeGreaterThan(0);
  expect(host.querySelector("img")?.clientHeight).toBeGreaterThan(0);
  expect(host.querySelector("[data-testid=provider-image-copy]")).not.toBeNull();
  expect(host.querySelector("[data-testid=provider-image-expand]")).not.toBeNull();

  const expand = host.querySelector<HTMLElement>("[data-testid=provider-image-expand]")!;
  act(() => expand.click());
  await expect
    .poll(() => document.querySelector("[data-testid=attachment-lightbox-close]"))
    .not.toBeNull();
  const backdrop = document.querySelector<HTMLElement>(
    "[data-testid=attachment-lightbox-backdrop]",
  )!;
  act(() => backdrop.click());
  await expect
    .poll(() => document.querySelector("[data-testid=attachment-lightbox-close]"))
    .toBeNull();
});
