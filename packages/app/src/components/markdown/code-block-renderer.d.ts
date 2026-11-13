declare module "react-native-enriched-markdown/lib/module/web/renderers/BlockRenderers" {
  import type { ReactElement } from "react";
  import type { RendererProps } from "react-native-enriched-markdown/src/web/types";

  export const blockRenderers: {
    CodeBlock?: (props: RendererProps) => ReactElement;
  };
}
