import { ActionIcon, Box, Code, CopyButton, Tooltip } from "@mantine/core";
import { TbCheck, TbCopy } from "react-icons/tb";
import useTranslate from "../../hooks/useTranslate.hook";

/** A code snippet that can be copied with one click */
const CodeBlock = ({ code }: { code: string }) => {
  const t = useTranslate();

  return (
    <Box style={{ position: "relative" }}>
      <Code
        block
        pr={44}
        sx={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}
      >
        {code}
      </Code>
      {/* The clipboard is only available in secure contexts (HTTPS) */}
      {window.isSecureContext && (
        <CopyButton value={code} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip
              label={
                copied ? t("common.button.copied") : t("common.button.copy")
              }
              withArrow
            >
              <ActionIcon
                onClick={copy}
                color={copied ? "teal" : "gray"}
                variant="subtle"
                aria-label={t("common.button.copy")}
                style={{ position: "absolute", top: 6, right: 6 }}
              >
                {copied ? <TbCheck size={16} /> : <TbCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      )}
    </Box>
  );
};

export default CodeBlock;
