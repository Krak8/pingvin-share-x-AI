import { ActionIcon, Group, Skeleton, Stack, TextInput } from "@mantine/core";
import { useClipboard } from "@mantine/hooks";
import { useModals } from "@mantine/modals";
import { useState } from "react";
import {
  TbClipboard,
  TbDownload,
  TbEye,
  TbLink,
  TbTerminal2,
} from "react-icons/tb";
import { FormattedMessage } from "react-intl";
import useBaseUrl from "../../hooks/baseUrl.hook";
import useTranslate from "../../hooks/useTranslate.hook";
import shareService from "../../services/share.service";
import { FileMetaData } from "../../types/File.type";
import { Share } from "../../types/share.type";
import toast from "../../utils/toast.util";
import SortableHeader, { TableSort } from "../core/SortIcon";
import showFilePreviewModal from "./modals/showFilePreviewModal";
import { HoverTip } from "../core/HoverTip";
import api from "../../services/api.service";
import FileTree, { ICON_SIZE } from "../core/FileTree";

const getFilePath = (file: FileMetaData) => file.name;
const getFileSize = (file: FileMetaData) => parseInt(file.size);
const getFileKey = (file: FileMetaData) => file.id;

const FileList = ({
  files,
  share,
  isLoading,
  recipientId,
}: {
  files?: FileMetaData[];
  share: Share;
  isLoading: boolean;
  recipientId?: string;
}) => {
  const clipboard = useClipboard();
  const getBaseUrl = useBaseUrl();
  const modals = useModals();
  const t = useTranslate();

  const [sort, setSort] = useState<TableSort>({
    property: "name",
    direction: "asc",
  });

  const getDirectLink = (file: FileMetaData) => {
    const recipientQuery = recipientId
      ? `?recipient=${encodeURIComponent(recipientId)}`
      : "";
    return `${getBaseUrl()}/api/d/${share.id}/${encodeURIComponent(file.name)}${recipientQuery}`;
  };

  // Copies the text, or shows it for manual copying where the clipboard isn't
  // available (it needs a secure context, i.e. HTTPS)
  const copyOrShow = (text: string, title: string, copiedMessage: string) => {
    if (window.isSecureContext) {
      clipboard.copy(text);
      toast.success(copiedMessage);
    } else {
      modals.openModal({
        title,
        children: (
          <Stack align="stretch">
            <TextInput variant="filled" value={text} readOnly />
          </Stack>
        ),
      });
    }
  };

  const copyFileLink = (file: FileMetaData) =>
    copyOrShow(
      getDirectLink(file),
      t("share.modal.file-link"),
      t("common.notify.copied-link"),
    );

  const copyCurlCommand = (file: FileMetaData) =>
    copyOrShow(
      `curl -OJ "${getDirectLink(file)}"`,
      t("share.file.copy-curl"),
      t("share.notify.curl-copied"),
    );

  return (
    <FileTree
      files={files ?? []}
      getPath={getFilePath}
      getSize={getFileSize}
      getKey={getFileKey}
      sort={sort}
      loadingRows={isLoading ? skeletonRows : undefined}
      nameHeader={
        <SortableHeader sort={sort} setSort={setSort} property="name">
          <FormattedMessage id="share.table.name" />
        </SortableHeader>
      }
      sizeHeader={
        <SortableHeader sort={sort} setSort={setSort} property="size">
          <FormattedMessage id="share.table.size" />
        </SortableHeader>
      }
      renderFileActions={(file) => (
        <Group position="right" noWrap>
          {!share.oneTimeDownload &&
            shareService.isShareTextFile(file.name) && (
              <HoverTip label={t("share.copy-text-contents")} touch={false}>
                <ActionIcon
                  color="blue"
                  variant="light"
                  size={ICON_SIZE}
                  aria-label={t("share.copy-text-contents")}
                  onClick={() => {
                    api
                      .get(
                        `/shares/${share.id}/files/${file.id}?download=false`,
                      )
                      .then((res) => {
                        if (window.isSecureContext) {
                          clipboard.copy(res.data);
                          toast.success(t("share.notify.copied-contents"));
                        } else {
                          toast.error(t("share.notify.copy-not-supported"));
                        }
                      });
                  }}
                >
                  <TbClipboard />
                </ActionIcon>
              </HoverTip>
            )}
          {!share.oneTimeDownload &&
            shareService.doesFileSupportPreview(file.name) && (
              <HoverTip label={t("common.button.preview")} touch={false}>
                <ActionIcon
                  color="green"
                  variant="light"
                  size={ICON_SIZE}
                  aria-label={t("common.button.preview")}
                  onClick={() => showFilePreviewModal(share.id, file, modals)}
                >
                  <TbEye />
                </ActionIcon>
              </HoverTip>
            )}
          {!share.hasPassword && !share.oneTimeDownload && (
            <HoverTip label={t("common.button.copy-link")} touch={false}>
              <ActionIcon
                color="victoria"
                variant="light"
                size={ICON_SIZE}
                aria-label={t("common.button.copy-link")}
                onClick={() => copyFileLink(file)}
              >
                <TbLink />
              </ActionIcon>
            </HoverTip>
          )}
          {!share.hasPassword && !share.oneTimeDownload && (
            <HoverTip label={t("share.file.copy-curl")} touch={false}>
              <ActionIcon
                color="gray"
                variant="light"
                size={ICON_SIZE}
                aria-label={t("share.file.copy-curl")}
                onClick={() => copyCurlCommand(file)}
              >
                <TbTerminal2 />
              </ActionIcon>
            </HoverTip>
          )}

          <HoverTip label={t("common.button.download")} touch={false}>
            <ActionIcon
              color="cyan"
              variant="light"
              size={ICON_SIZE}
              aria-label={t("common.button.download")}
              onClick={async () => {
                await shareService.downloadFile(share.id, file.id, recipientId);
              }}
            >
              <TbDownload />
            </ActionIcon>
          </HoverTip>
        </Group>
      )}
    />
  );
};

const skeletonRows = [...Array(5)].map((c, i) => (
  <tr key={i}>
    <td>
      <Skeleton height={30} width={30} />
    </td>
    <td>
      <Skeleton height={14} />
    </td>
    <td>
      <Skeleton height={14} />
    </td>
    <td>
      <Skeleton height={25} width={25} />
    </td>
  </tr>
));

export default FileList;
