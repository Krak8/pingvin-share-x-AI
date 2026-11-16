import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Center,
  Checkbox,
  CopyButton,
  Divider,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import moment from "moment";
import { useCallback, useEffect, useState } from "react";
import {
  TbAlertTriangle,
  TbCheck,
  TbCopy,
  TbDownload,
  TbKey,
  TbPlus,
  TbTrash,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useBaseUrl from "../../hooks/baseUrl.hook";
import useConfig from "../../hooks/config.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import apiTokenService from "../../services/apiToken.service";
import {
  ApiToken,
  ApiTokenScope,
  CreatedApiToken,
} from "../../types/apiToken.type";
import {
  buildShareXConfig,
  downloadTextFile,
  getCurlExamples,
} from "../../utils/apiExamples.util";
import toast from "../../utils/toast.util";
import CodeBlock from "../core/CodeBlock";

const SCOPES: ApiTokenScope[] = ["upload", "read", "manage"];

// Tokens that run out within this many days are highlighted
const EXPIRES_SOON_DAYS = 7;

type TokenStatus = "active" | "expires-soon" | "expired";

const getStatus = (token: ApiToken): TokenStatus => {
  if (!token.expiresAt) return "active";
  const msLeft = new Date(token.expiresAt).getTime() - Date.now();
  if (msLeft <= 0) return "expired";
  return msLeft <= EXPIRES_SOON_DAYS * 24 * 60 * 60 * 1000
    ? "expires-soon"
    : "active";
};

const ScopeBadge = ({ scope }: { scope: ApiTokenScope }) => {
  const t = useTranslate();
  return (
    <Tooltip
      label={t(`account.card.api-tokens.scope.${scope}.description`)}
      withArrow
      events={{ hover: true, focus: true, touch: true }}
    >
      <Badge
        size="sm"
        variant="light"
        tabIndex={0}
        sx={{ textTransform: "none", cursor: "default" }}
      >
        {t(`account.card.api-tokens.scope.${scope}`)}
      </Badge>
    </Tooltip>
  );
};

const CreateTokenForm = ({
  onCreated,
}: {
  onCreated: (token: CreatedApiToken) => void;
}) => {
  const t = useTranslate();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiTokenScope[]>(["upload", "read"]);
  const [expiration, setExpiration] = useState("90");
  const [loading, setLoading] = useState(false);

  const toggleScope = (scope: ApiTokenScope, checked: boolean) =>
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((s) => s !== scope),
    );

  const submit = async () => {
    setLoading(true);
    try {
      const created = await apiTokenService.create({
        name: name.trim(),
        // keep a stable order regardless of the order they were ticked in
        scopes: SCOPES.filter((scope) => scopes.includes(scope)),
        expiresInDays:
          expiration === "never" ? undefined : parseInt(expiration),
      });
      onCreated(created);
    } catch (e) {
      toast.axiosError(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack spacing="lg">
      <TextInput
        label={t("account.card.api-tokens.name")}
        description={t("account.card.api-tokens.name.description")}
        placeholder={t("account.card.api-tokens.name.placeholder")}
        value={name}
        maxLength={50}
        onChange={(e) => setName(e.currentTarget.value)}
        data-autofocus
      />

      <Stack spacing="xs">
        <Text size="sm" weight={500}>
          <FormattedMessage id="account.card.api-tokens.scopes" />
        </Text>
        {SCOPES.map((scope) => (
          <Checkbox
            key={scope}
            checked={scopes.includes(scope)}
            onChange={(e) => toggleScope(scope, e.currentTarget.checked)}
            label={
              <Stack spacing={0}>
                <Text size="sm" weight={500}>
                  {t(`account.card.api-tokens.scope.${scope}`)}
                </Text>
                <Text size="xs" color="dimmed">
                  {t(`account.card.api-tokens.scope.${scope}.description`)}
                </Text>
              </Stack>
            }
          />
        ))}
      </Stack>

      <Stack spacing={6}>
        <Text size="sm" weight={500}>
          <FormattedMessage id="account.card.api-tokens.expiration" />
        </Text>
        <SegmentedControl
          fullWidth
          value={expiration}
          onChange={setExpiration}
          data={["30", "90", "365", "never"].map((value) => ({
            value,
            label: t(`account.card.api-tokens.expiration.${value}`),
          }))}
        />
      </Stack>

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

// Modals are rendered outside of the config context, so everything that
// depends on the configuration is passed in
const CreatedTokenView = ({
  created,
  baseUrl,
  appName,
  onDone,
}: {
  created: CreatedApiToken;
  baseUrl: string;
  appName: string;
  onDone: () => void;
}) => {
  const t = useTranslate();

  const examples = getCurlExamples(baseUrl, created.token, created.scopes);
  const canUpload = created.scopes.includes("upload");

  return (
    <Stack>
      <Alert
        icon={<TbAlertTriangle size={18} />}
        color="orange"
        variant="light"
        p="sm"
      >
        <FormattedMessage id="account.card.api-tokens.created.warning" />
      </Alert>

      <Group spacing="xs" align="flex-end">
        <TextInput
          readOnly
          variant="filled"
          value={created.token}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={created.name}
          sx={{ flex: "1 1 220px" }}
          styles={{ input: { fontFamily: "monospace", fontSize: 13 } }}
        />
        {window.isSecureContext && (
          <CopyButton value={created.token} timeout={2000}>
            {({ copied, copy }) => (
              <Button
                onClick={copy}
                color={copied ? "teal" : undefined}
                leftIcon={copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
              >
                {copied ? (
                  <FormattedMessage id="common.button.copied" />
                ) : (
                  <FormattedMessage id="account.card.api-tokens.created.copy" />
                )}
              </Button>
            )}
          </CopyButton>
        )}
      </Group>

      <Tabs defaultValue="curl" mt="xs">
        <Tabs.List>
          <Tabs.Tab value="curl">
            <FormattedMessage id="account.card.api-tokens.tab.curl" />
          </Tabs.Tab>
          <Tabs.Tab value="sharex">
            <FormattedMessage id="account.card.api-tokens.tab.sharex" />
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="curl" pt="md">
          <Stack spacing="md">
            {examples.map((example) => (
              <Stack spacing={4} key={example.id}>
                <Text size="sm" weight={500}>
                  {t(`account.card.api-tokens.example.${example.id}`)}
                </Text>
                <CodeBlock code={example.code} />
              </Stack>
            ))}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="sharex" pt="md">
          {canUpload ? (
            <Stack spacing="sm" align="flex-start">
              <Text size="sm">
                <FormattedMessage id="account.card.api-tokens.sharex.description" />
              </Text>
              <Text size="sm" weight={500}>
                <FormattedMessage id="account.card.api-tokens.sharex.warning" />
              </Text>
              <Button
                variant="light"
                leftIcon={<TbDownload size={16} />}
                onClick={() =>
                  downloadTextFile(
                    `${appName}.sxcu`,
                    buildShareXConfig(baseUrl, created.token, appName),
                  )
                }
              >
                <FormattedMessage id="account.card.api-tokens.sharex.download" />
              </Button>
            </Stack>
          ) : (
            <Text size="sm" color="dimmed">
              <FormattedMessage id="account.card.api-tokens.sharex.needs-upload" />
            </Text>
          )}
        </Tabs.Panel>
      </Tabs>

      <Button onClick={onDone} variant="default">
        <FormattedMessage id="common.button.done" />
      </Button>
    </Stack>
  );
};

const TokenRow = ({
  token,
  onRevoke,
}: {
  token: ApiToken;
  onRevoke: (token: ApiToken) => void;
}) => {
  const t = useTranslate();
  const status = getStatus(token);

  const expiryText = !token.expiresAt
    ? t("account.card.api-tokens.never-expires")
    : t(
        status === "expired"
          ? "account.card.api-tokens.expired-on"
          : "account.card.api-tokens.expires",
        { date: moment(token.expiresAt).format("LL") },
      );

  return (
    <Group
      position="apart"
      noWrap
      align="flex-start"
      py="sm"
      sx={{ opacity: status === "expired" ? 0.6 : 1 }}
    >
      <Stack spacing={6} sx={{ minWidth: 0 }}>
        <Group spacing="xs">
          <Text weight={600} sx={{ wordBreak: "break-word" }}>
            {token.name}
          </Text>
          {status === "expired" && (
            <Badge
              color="red"
              variant="light"
              size="sm"
              sx={{ textTransform: "none" }}
            >
              {t("account.card.api-tokens.status.expired")}
            </Badge>
          )}
          {status === "expires-soon" && (
            <Badge
              color="orange"
              variant="light"
              size="sm"
              sx={{ textTransform: "none" }}
            >
              {t("account.card.api-tokens.status.expires-soon", {
                when: moment(token.expiresAt).fromNow(),
              })}
            </Badge>
          )}
        </Group>

        <Group spacing={6}>
          {token.scopes.map((scope) => (
            <ScopeBadge key={scope} scope={scope} />
          ))}
          <Text size="xs" color="dimmed" ff="monospace">
            {token.prefix}…
          </Text>
        </Group>

        <Text size="xs" color="dimmed">
          {token.lastUsedAt
            ? t("account.card.api-tokens.last-used", {
                when: moment(token.lastUsedAt).fromNow(),
              })
            : t("account.card.api-tokens.never-used")}
          {" · "}
          {expiryText}
        </Text>
      </Stack>

      <Tooltip label={t("account.card.api-tokens.revoke")} withArrow>
        <ActionIcon
          color="red"
          variant="light"
          aria-label={`${t("account.card.api-tokens.revoke")}: ${token.name}`}
          onClick={() => onRevoke(token)}
        >
          <TbTrash size={16} />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};

const ApiTokens = () => {
  const t = useTranslate();
  const modals = useModals();
  const config = useConfig();
  const getBaseUrl = useBaseUrl();
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);

  const reload = useCallback(() => {
    apiTokenService
      .list()
      .then(setTokens)
      .catch((e) => {
        setTokens([]);
        toast.axiosError(e);
      });
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
            const createdModalId = modals.openModal({
              title: t("account.card.api-tokens.created.title"),
              size: "lg",
              closeOnClickOutside: false,
              children: (
                <CreatedTokenView
                  created={created}
                  baseUrl={getBaseUrl()}
                  appName={config.get("general.appName")}
                  onDone={() => modals.closeModal(createdModalId)}
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
          .then(() => {
            toast.success(t("account.card.api-tokens.revoked"));
            reload();
          })
          .catch((e) => toast.axiosError(e)),
    });

  return (
    <Paper withBorder p="xl" mt="lg">
      <Group position="apart" noWrap>
        <Title order={5}>
          <FormattedMessage id="account.card.api-tokens.title" />
        </Title>
        {tokens && tokens.length > 0 && (
          <Button
            size="xs"
            leftIcon={<TbPlus size={14} />}
            onClick={openCreateModal}
            sx={{ flexShrink: 0 }}
          >
            <FormattedMessage id="account.card.api-tokens.create" />
          </Button>
        )}
      </Group>
      <Text size="sm" color="dimmed" mt={4}>
        <FormattedMessage id="account.card.api-tokens.description" />
      </Text>

      {tokens && tokens.length === 0 && (
        <Center py="xl">
          <Stack align="center" spacing="xs" sx={{ maxWidth: 360 }}>
            <ThemeIcon size={44} radius="xl" variant="light">
              <TbKey size={22} />
            </ThemeIcon>
            <Text weight={600}>
              <FormattedMessage id="account.card.api-tokens.empty.title" />
            </Text>
            <Text size="sm" color="dimmed" align="center">
              <FormattedMessage id="account.card.api-tokens.empty.description" />
            </Text>
            <Button
              mt="xs"
              leftIcon={<TbPlus size={16} />}
              onClick={openCreateModal}
            >
              <FormattedMessage id="account.card.api-tokens.create" />
            </Button>
          </Stack>
        </Center>
      )}

      {tokens && tokens.length > 0 && (
        <Stack spacing={0} mt="md">
          {tokens.map((token, index) => (
            <Box key={token.id}>
              {index > 0 && <Divider />}
              <TokenRow token={token} onRevoke={confirmRevoke} />
            </Box>
          ))}
        </Stack>
      )}
    </Paper>
  );
};

export default ApiTokens;
