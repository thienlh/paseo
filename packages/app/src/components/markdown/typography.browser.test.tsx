import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { lightTheme } from "@/styles/theme";
import { MarkdownRenderer } from "./renderer";

vi.mock("react-native-unistyles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native-unistyles")>();
  return {
    ...actual,
    withUnistyles:
      (Component: React.ComponentType<Record<string, unknown>>) =>
      ({ uniProps, ...props }: Record<string, unknown>) => {
        const themedProps = uniProps
          ? (
              uniProps as (
                theme: typeof lightTheme,
                rt: { breakpoint: string },
              ) => Record<string, unknown>
            )(lightTheme, { breakpoint: "lg" })
          : {};
        return React.createElement(Component, { ...props, ...themedProps });
      },
  };
});

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root;
let host: HTMLDivElement;
let queryClient: QueryClient;

beforeEach(() => {
  queryClient = new QueryClient();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  queryClient.clear();
  host.remove();
});

it("paints quiet prose, inline emphasis, and heading weights", async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MarkdownRenderer
          text={"Plain and **bold** text.\n\n# Large heading\n\n#### Small heading"}
        />
      </QueryClientProvider>,
    );
  });

  await expect.poll(() => host.querySelector("strong")).not.toBeNull();
  expect(getComputedStyle(host.querySelector("p")!).fontWeight).toBe("450");
  expect(getComputedStyle(host.querySelector("strong")!).fontWeight).toBe("500");
  expect(getComputedStyle(host.querySelector("h1")!).fontWeight).toBe("600");
  expect(getComputedStyle(host.querySelector("h4")!).fontWeight).toBe("500");
});

it("highlights workspace file links without highlighting external URLs", async () => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MarkdownRenderer
          workspaceRoot="/repo"
          text={"[project](/repo/src/app.ts) and [web](https://example.com)"}
        />
      </QueryClientProvider>,
    );
  });

  await expect.poll(() => host.querySelectorAll("a").length).toBe(2);
  const fileStyle = getComputedStyle(host.querySelector('a[href="/repo/src/app.ts"]')!);
  const externalStyle = getComputedStyle(host.querySelector('a[href="https://example.com"]')!);
  expect(fileStyle.fontFamily).toContain("SFMono-Regular");
  expect(fileStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(fileStyle.borderTopWidth).toBe("0px");
  expect(fileStyle.borderRadius).toBe("6px");
  expect(externalStyle.fontFamily).not.toBe(lightTheme.fontFamily.mono);
  expect(externalStyle.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  expect(externalStyle.borderTopWidth).toBe("0px");
});
