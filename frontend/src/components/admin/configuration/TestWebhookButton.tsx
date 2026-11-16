import { Button, Stack, Text, Textarea } from "@mantine/core";
import { useModals } from "@mantine/modals";
import { useState } from "react";
import { TbSend } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useTranslate from "../../../hooks/useTranslate.hook";
import configService from "../../../services/config.service";
import { getApiErrorMessage } from "../../../utils/error.util";
import toast from "../../../utils/toast.util";

const TestWebhookButton = ({
  configVariablesChanged,
  saveConfigVariables,
}: {
  configVariablesChanged: boolean;
  saveConfigVariables: () => Promise<void>;
}) => {
  const modals = useModals();
  const t = useTranslate();
  const [isLoading, setIsLoading] = useState(false);

  const showError = (e: unknown) =>
    modals.openModal({
      title: t("admin.config.integrations.test-webhook.modal.error.title"),
      children: (
        <Stack spacing="xs">
          <Text size="sm">
            <FormattedMessage id="admin.config.integrations.test-webhook.modal.error.description" />
          </Text>
          <Textarea
            minRows={3}
            readOnly
            value={getApiErrorMessage(e) ?? t("common.error.unknown")}
          />
        </Stack>
      ),
    });

  const sendTest = async () => {
    setIsLoading(true);
    try {
      await configService.testWebhook();
      toast.success(t("admin.config.integrations.test-webhook.success"));
    } catch (e) {
      showError(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      loading={isLoading}
      variant="light"
      leftIcon={<TbSend size={16} />}
      onClick={() => {
        if (!configVariablesChanged) {
          void sendTest();
          return;
        }

        // The server tests what is saved, so unsaved changes would be ignored
        modals.openConfirmModal({
          title: t("admin.config.integrations.test-webhook.modal.save.title"),
          children: (
            <Text size="sm">
              <FormattedMessage id="admin.config.integrations.test-webhook.modal.save.description" />
            </Text>
          ),
          labels: {
            confirm: t(
              "admin.config.integrations.test-webhook.modal.save.confirm",
            ),
            cancel: t("common.button.cancel"),
          },
          onConfirm: async () => {
            await saveConfigVariables();
            await sendTest();
          },
        });
      }}
    >
      <FormattedMessage id="admin.config.integrations.button.test-webhook" />
    </Button>
  );
};

export default TestWebhookButton;
