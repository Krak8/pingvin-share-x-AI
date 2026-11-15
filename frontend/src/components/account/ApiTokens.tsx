import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Code,
  Group,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { useCallback, useEffect, useState } from "react";
import { TbCheck, TbCopy, TbTrash } from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import apiTokenService from "../../services/apiToken.service";
import {
  ApiToken,
  ApiTokenScope,
  CreatedApiToken,
} from "../../types/apiToken.type";
import toast from "../../utils/toast.util";

const SCOPES: ApiTokenScope[] = ["upload", "read", "manage"];

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString() : null;

const getBaseUrl = (config: ReturnType<typeof useConfig>) =>
  config.get("general.appUrl") !== config.get("general.appUrl", true)
    ? config.get("general.appUrl")
    : window.location.origin;

const CreateTokenForm = ({
  onCreated,
}: {
  onCreated: (token: CreatedApiToken) => void;
}) => {
  const t = useTranslate();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["upload", "read"]);
  const [expiresInDays, setExpiresInDays] = useState<string>("90");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      const created = await apiTokenService.create({
        name,
        scopes,
        expiresInDays:
          expiresInDays === "never" ? undefined : parseInt(expiresInDays),
      });
      onCreated(created);
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack>
      <TextInput
        label={t("account.card.api-tokens.name")}
        placeholder={t("account.card.api-tokens.name.placeholder")}
        value={name}
        maxLength={50}
        onChange={(e) => setName(e.currentTarget.value)}
        data-autofocus
      />
      <Checkbox.Group
        label={t("account.card.api-tokens.scopes")}
        value={scopes}
        onChange={(value) => setScopes(value as ApiTokenScope[])}
      >
        <Stack spacing="xs" mt="xs">
          {SCOPES.map((scope) => (
            <Checkbox
              key={scope}
              value={scope}
              label={t(`account.card.api-tokens.scope.${scope}`)}
            />
          ))}
        </Stack>
      </Checkbox.Group>
      <Select
        label={t("account.card.api-tokens.expiration")}
        value={expiresInDays}
        onChange={(value) => setExpiresInDays(value ?? "90")}
        data={[
          { value: "30", label: t("account.card.api-tokens.expiration.30") },
          { value: "90", label: t("account.card.api-tokens.expiration.90") },
          { value: "365", label: t("account.card.api-tokens.expiration.365") },
          {
            value: "never",
            label: t("account.card.api-tokens.expiration.never"),
          },
        ]}
      />
      <Button
        onClick={submit}
        loading={loading}
        disabled={name.trim().length === 0 || scopes.length === 0}
      >
        <FormattedMessage id="account.card.api-tokens.create" />
      </Button>
    </Stack>
  );
};

const CreatedTokenView = ({
  token,
  baseUrl,
}: {
  token: string;
  baseUrl: string;
}) => {
  const t = useTranslate();
  const clipboard = useClipboard({ timeout: 1500 });
  const example = `curl -H "Authorization: Bearer ${token}" \\\n     -F "file=@file.zip" ${baseUrl}/api/upload`;

  return (
    <Stack>
      <Text size="sm">
        <FormattedMessage id="account.card.api-tokens.created.description" />
      </Text>
      <TextInput
        readOnly
        variant="filled"
        value={token}
        onFocus={(e) => e.currentTarget.select()}
        rightSection={
          window.isSecureContext ? (
            <ActionIcon
              onClick={() => {
                clipboard.copy(token);
                toast.success(t("account.card.api-tokens.copied"));
              }}
            >
              {clipboard.copied ? <TbCheck /> : <TbCopy />}
            </ActionIcon>
          ) : undefined
        }
      />
      <Text size="sm" weight={500}>
        <FormattedMessage id="account.card.api-tokens.example" />
      </Text>
      <Code block>{example}</Code>
    </Stack>
  );
};

const ApiTokens = () => {
  const t = useTranslate();
  const modals = useModals();
  const config = useConfig();
  const [tokens, setTokens] = useState<ApiToken[]>([]);

  const reload = useCallback(() => {
    apiTokenService
      .list()
      .then(setTokens)
      .catch((e) => toast.axiosError(e));
  }, []);

  useEffect(reload, [reload]);

  const openCreateModal = () => {
    const modalId = modals.openModal({
      title: t("account.card.api-tokens.create.title"),
      children: (
        <CreateTokenForm
          onCreated={(created) => {
            modals.closeModal(modalId);
            reload();
            modals.openModal({
              title: t("account.card.api-tokens.created.title"),
              size: "lg",
              closeOnClickOutside: false,
              children: (
                <CreatedTokenView
                  token={created.token}
                  baseUrl={getBaseUrl(config)}
                />
              ),
            });
          }}
        />
      ),
    });
  };

  const confirmRevoke = (token: ApiToken) =>
    modals.openConfirmModal({
      title: t("account.card.api-tokens.revoke.title", { name: token.name }),
      children: (
        <Text size="sm">
          <FormattedMessage id="account.card.api-tokens.revoke.description" />
        </Text>
      ),
      labels: {
        confirm: t("account.card.api-tokens.revoke"),
        cancel: t("common.button.cancel"),
      },
      confirmProps: { color: "red" },
      onConfirm: () =>
        apiTokenService
          .revoke(token.id)
          .then(reload)
          .catch((e) => toast.axiosError(e)),
    });

  return (
    <Paper withBorder p="xl" mt="lg">
      <Group position="apart" mb="xs">
        <Title order={5}>
          <FormattedMessage id="account.card.api-tokens.title" />
        </Title>
        <Button size="xs" variant="light" onClick={openCreateModal}>
          <FormattedMessage id="account.card.api-tokens.create" />
        </Button>
      </Group>
      <Text size="sm" color="dimmed" mb="md">
        <FormattedMessage id="account.card.api-tokens.description" />
      </Text>

      {tokens.length === 0 ? (
        <Text size="sm" color="dimmed">
          <FormattedMessage id="account.card.api-tokens.empty" />
        </Text>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <Table verticalSpacing="xs">
            <tbody>
              {tokens.map((token) => (
                <tr key={token.id}>
                  <td>
                    <Text weight={500}>{token.name}</Text>
                    <Text size="xs" color="dimmed">
                      <Code>{token.prefix}…</Code>
                    </Text>
                  </td>
                  <td>
                    <Group spacing={4}>
                      {token.scopes.map((scope) => (
                        <Badge key={scope} size="sm" variant="light">
                          {scope}
                        </Badge>
                      ))}
                    </Group>
                  </td>
                  <td>
                    <Text size="xs" color="dimmed">
                      {token.expiresAt
                        ? t("account.card.api-tokens.expires", {
                            date: formatDate(token.expiresAt) ?? "",
                          })
                        : t("account.card.api-tokens.never-expires")}
                    </Text>
                    <Text size="xs" color="dimmed">
                      {token.lastUsedAt
                        ? t("account.card.api-tokens.last-used", {
                            date: formatDate(token.lastUsedAt) ?? "",
                          })
                        : t("account.card.api-tokens.never-used")}
                    </Text>
                  </td>
                  <td>
                    <ActionIcon
                      color="red"
                      variant="light"
                      aria-label={t("account.card.api-tokens.revoke")}
                      onClick={() => confirmRevoke(token)}
                    >
                      <TbTrash size={16} />
                    </ActionIcon>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </Paper>
  );
};

export default ApiTokens;
