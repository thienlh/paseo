import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { View } from "react-native";
import { Image } from "expo-image";
import { Check, Copy, Download, Maximize2, TriangleAlert } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AttachmentLightbox, type ImageLightboxSource } from "@/components/attachment-lightbox";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { useFileDownload } from "@/hooks/use-file-download";
import { useMarkdownSource, type MarkdownImageContext } from "@/components/markdown/images";
import { resolveMarkdownPreviewImageSource } from "@/components/markdown/image-source";
import { copyProviderImageToClipboard } from "./provider-image-clipboard";

const ThemedImage = withUnistyles(Image);
const ThemedCheck = withUnistyles(Check);
const ThemedCopy = withUnistyles(Copy);
const ThemedDownload = withUnistyles(Download);
const ThemedMaximize = withUnistyles(Maximize2);
const ThemedWarning = withUnistyles(TriangleAlert);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type CopyStatus = "idle" | "copying" | "copied" | "failed";

function copyLabel(status: CopyStatus, t: TFunction): string {
  switch (status) {
    case "copying":
      return t("common.states.loading");
    case "copied":
      return t("common.states.copied");
    case "failed":
      return t("common.errors.unableToCopy");
    default:
      return t("common.actions.copy");
  }
}

function CopyStatusIcon({ status }: { status: CopyStatus }) {
  if (status === "copied") return <ThemedCheck size={14} uniProps={foregroundMapping} />;
  if (status === "failed") return <ThemedWarning size={14} uniProps={foregroundMapping} />;
  return <ThemedCopy size={14} uniProps={foregroundMapping} />;
}

interface ProviderImagePreviewProps extends MarkdownImageContext {
  source: string;
  alt: string;
}

export function ProviderImagePreview({ source, alt, ...context }: ProviderImagePreviewProps) {
  const { t } = useTranslation();
  const { images } = useMarkdownSource(`![${alt}](${source})`, context);
  const image = images[0];
  const [isOpen, setIsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (copyStatus !== "copied" && copyStatus !== "failed") return;
    const timer = setTimeout(() => setCopyStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const handleCopy = useCallback(() => {
    if (!image?.url) return;
    setCopyStatus("copying");
    void copyProviderImageToClipboard(image.url)
      .then(() => setCopyStatus("copied"))
      .catch(() => setCopyStatus("failed"));
  }, [image?.url]);
  const imageSource = useMemo(() => ({ uri: image?.url ?? "" }), [image?.url]);
  const lightboxSource = useMemo<ImageLightboxSource | null>(
    () => (isOpen && image?.url ? { type: "uri", uri: image.url } : null),
    [isOpen, image?.url],
  );

  const copyLabelText = copyLabel(copyStatus, t);

  if (!image || image.status === "pending") {
    return (
      <View style={styles.pending} testID="provider-image-pending">
        <ThemedLoadingSpinner uniProps={foregroundMutedMapping} />
      </View>
    );
  }
  if (image.status === "unavailable" || !image.url) {
    return null;
  }

  return (
    <View style={styles.container} testID="provider-image-preview">
      <PressHighlight
        accessibilityRole="button"
        accessibilityLabel={alt}
        onPress={open}
        style={styles.imageFrame}
        testID="provider-image-open"
      >
        <ThemedImage source={imageSource} style={styles.image} contentFit="contain" />
      </PressHighlight>
      <View style={styles.actions}>
        {isWeb ? (
          <ToolbarButton
            label={copyLabelText}
            disabled={copyStatus === "copying"}
            onPress={handleCopy}
            testID="provider-image-copy"
          >
            <CopyStatusIcon status={copyStatus} />
          </ToolbarButton>
        ) : null}
        <ProviderImageDownloadAction source={source} context={context} />
        <ToolbarButton
          label={t("composer.attachments.openImage")}
          onPress={open}
          testID="provider-image-expand"
        >
          <ThemedMaximize size={14} uniProps={foregroundMapping} />
        </ToolbarButton>
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={close} />
    </View>
  );
}

function ProviderImageDownloadAction({
  source,
  context,
}: {
  source: string;
  context: MarkdownImageContext;
}) {
  const resolvedPath = useMemo(
    () =>
      resolveMarkdownPreviewImageSource({
        source,
        markdownPath: context.filePath ?? "",
        workspaceRoot: context.workspaceRoot,
      }),
    [context.filePath, context.workspaceRoot, source],
  );
  if (!context.serverId || !resolvedPath || /^(https?:|data:|blob:)/i.test(resolvedPath)) {
    return null;
  }
  return <DownloadButton serverId={context.serverId} path={resolvedPath} />;
}

function DownloadButton({ serverId, path }: { serverId: string; path: string }) {
  const { t } = useTranslation();
  const download = useFileDownload({ serverId, workspaceRoot: "/" });
  const handleDownload = useCallback(() => {
    download({ fileName: path.split("/").pop() ?? "image.png", path });
  }, [download, path]);
  return (
    <ToolbarButton
      label={t("workspace.fileActions.download")}
      onPress={handleDownload}
      testID="provider-image-download"
    >
      <ThemedDownload size={14} uniProps={foregroundMapping} />
    </ToolbarButton>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    maxWidth: 480,
    alignSelf: "flex-start",
  },
  imageFrame: {
    width: "100%",
    height: 240,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  actions: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    flexDirection: "row",
    gap: theme.spacing[1],
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface1,
  },
  pending: {
    width: "100%",
    maxWidth: 480,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
}));
