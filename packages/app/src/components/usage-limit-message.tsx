import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { MessageSquarePlus, RotateCw } from "lucide-react-native";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { assistantMessageStylesheet } from "@/components/message";
import type { UsageLimitDetails } from "@/components/usage-limit-message-model";
import type { AgentScreenAgent } from "@/hooks/use-agent-screen-state-machine";
import { useUsageLimitRetry } from "@/hooks/use-usage-limit-retry";
import type { ToastApi } from "@/components/toast-host";
import type { UserMessageItem } from "@/types/stream";
import { formatResetLabel, formatResetTime } from "@/usage/format";
import { useRelativeTimeTick } from "@/usage/use-relative-time-tick";

export const UsageLimitMessage = memo(function UsageLimitMessage({
  serverId,
  agentId,
  agent,
  details,
  retryMessage,
  toast,
  readOnly = false,
  spacing = "default",
}: {
  serverId: string;
  agentId: string;
  agent: AgentScreenAgent;
  details: UsageLimitDetails;
  retryMessage: UserMessageItem | null;
  toast?: ToastApi | null;
  readOnly?: boolean;
  spacing?: "default" | "compactTop" | "compactBottom" | "compactBoth";
}) {
  const { t } = useTranslation();
  const now = useRelativeTimeTick({ enabled: details.resetAt !== null });
  const { pendingAction, retry, retryInNewChat } = useUsageLimitRetry({
    serverId,
    agentId,
    agent,
    toast,
    readOnly,
  });
  const description = useMemo(() => {
    if (!details.resetAt) return details.message;
    const reset = formatResetLabel(details.resetAt, false, now, t);
    const time = formatResetTime(details.resetAt, now, t);
    const timing = [reset, time].filter(Boolean).join(" · ");
    return timing ? `${details.message}\n${timing}` : details.message;
  }, [details, now, t]);
  const containerStyle = useMemo(
    () => [
      assistantMessageStylesheet.container,
      (spacing === "compactTop" || spacing === "compactBoth") &&
        assistantMessageStylesheet.containerCompactTop,
      (spacing === "compactBottom" || spacing === "compactBoth") &&
        assistantMessageStylesheet.containerCompactBottom,
    ],
    [spacing],
  );
  const handleRetry = useCallback(() => {
    if (retryMessage) void retry(retryMessage);
  }, [retry, retryMessage]);
  const handleRetryInNewChat = useCallback(() => {
    if (retryMessage) void retryInNewChat(retryMessage);
  }, [retryInNewChat, retryMessage]);

  return (
    <View style={containerStyle}>
      <Alert
        title={t("message.usageLimit.title")}
        description={description}
        variant="warning"
        testID="usage-limit-message"
      >
        {retryMessage && !readOnly ? (
          <>
            <Button
              variant="outline"
              leftIcon={RotateCw}
              onPress={handleRetry}
              disabled={pendingAction !== null}
              loading={pendingAction === "retry"}
              testID="usage-limit-retry"
            >
              {t("common.actions.retry")}
            </Button>
            <Button
              variant="outline"
              leftIcon={MessageSquarePlus}
              onPress={handleRetryInNewChat}
              disabled={pendingAction !== null}
              loading={pendingAction === "new-chat"}
              testID="usage-limit-retry-new-chat"
            >
              {t("message.usageLimit.retryNewChat")}
            </Button>
          </>
        ) : null}
      </Alert>
    </View>
  );
});
