import {
  ActionIcon,
  Button,
  Collapse,
  CopyButton,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useModals } from "@mantine/modals";
import { ModalsContextProps } from "@mantine/modals/lib/context";
import { useState } from "react";
import { TbCheck, TbCopy } from "react-icons/tb";
import moment from "moment";
import { useRouter } from "next/router";
import { FormattedMessage } from "react-intl";
import useTranslate, {
  translateOutsideContext,
} from "../../../hooks/useTranslate.hook";
import { CompletedShare } from "../../../types/share.type";
import CopyTextField from "../CopyTextField";
import QRCode from "../../share/QRCode";

const showCompletedUploadModal = (
  modals: ModalsContextProps,
  share: CompletedShare,
  appUrl: string,
  defaultAppUrl: string,
  // Set for single file shares without restrictions: offers a link to the file itself
  directFileName?: string,
) => {
  const t = translateOutsideContext();
  return modals.openModal({
    closeOnClickOutside: false,
    withCloseButton: false,
    closeOnEscape: false,
    title: t("upload.modal.completed.share-ready"),
    children: (
      <Body
        share={share}
        appUrl={appUrl}
        defaultAppUrl={defaultAppUrl}
        directFileName={directFileName}
      />
    ),
  });
};

const Body = ({
  share,
  appUrl,
  defaultAppUrl,
  directFileName,
}: {
  share: CompletedShare;
  appUrl: string;
  defaultAppUrl: string;
  directFileName?: string;
}) => {
  const modals = useModals();
  const router = useRouter();
  const t = useTranslate();

  const [showQR, setShowQR] = useState(false);

  const handleToggleQR = () => {
    setShowQR(!showQR);
  };

  const isReverseShare = !!router.query["reverseShareToken"];

  const baseUrl = appUrl !== defaultAppUrl ? appUrl : window.location.origin;
  const link = `${baseUrl}/s/${share.id}`;
  const directLink = directFileName
    ? `${baseUrl}/api/d/${share.id}/${encodeURIComponent(directFileName)}`
    : undefined;

  return (
    <Stack align="stretch">
      <CopyTextField link={link} toggleQR={handleToggleQR} />
      <Collapse in={showQR}>
        <QRCode link={link} />
      </Collapse>
      {directLink && (
        <TextInput
          readOnly
          variant="filled"
          size="xs"
          label={t("upload.modal.completed.direct-link")}
          value={directLink}
          onFocus={(e) => e.currentTarget.select()}
          rightSection={
            window.isSecureContext ? (
              <CopyButton value={directLink} timeout={1500}>
                {({ copied, copy }) => (
                  <ActionIcon
                    size="sm"
                    onClick={copy}
                    color={copied ? "teal" : "gray"}
                    aria-label={t("common.button.copy")}
                  >
                    {copied ? <TbCheck size={14} /> : <TbCopy size={14} />}
                  </ActionIcon>
                )}
              </CopyButton>
            ) : undefined
          }
        />
      )}
      {share.notifyReverseShareCreator === true && (
        <Text
          size="sm"
          sx={(theme) => ({
            color:
              theme.colorScheme === "dark"
                ? theme.colors.gray[3]
                : theme.colors.dark[4],
          })}
        >
          {t("upload.modal.completed.notified-reverse-share-creator")}
        </Text>
      )}
      <Text
        size="xs"
        sx={(theme) => ({
          color: theme.colors.gray[6],
        })}
      >
        {/* If our share.expiration is timestamp 0, show a different message */}
        {moment(share.expiration).unix() === 0
          ? t("upload.modal.completed.never-expires")
          : t("upload.modal.completed.expires-on", {
              expiration: moment(share.expiration).format("LLL"),
            })}
      </Text>

      <Button
        onClick={() => {
          modals.closeAll();
          if (isReverseShare) {
            router.reload();
          } else {
            router.push("/upload");
          }
        }}
      >
        <FormattedMessage id="common.button.done" />
      </Button>
    </Stack>
  );
};

export default showCompletedUploadModal;
