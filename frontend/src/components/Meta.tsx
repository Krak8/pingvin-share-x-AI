import Head from "next/head";
import useConfig from "../hooks/config.hook";
import { EmbedInfo } from "../types/embed.type";
import { byteToHumanSizeString } from "../utils/fileSize.util";

const DEFAULT_DESCRIPTION = "An open-source and self-hosted sharing platform.";

const Meta = ({
  title,
  description,
  embed,
  shareId,
}: {
  title: string;
  description?: string;
  // Link preview data. Only available when a preview bot requests the page.
  embed?: EmbedInfo | null;
  shareId?: string;
}) => {
  const config = useConfig();

  const rich = embed && !embed.generic ? embed : undefined;

  const metaTitle = rich?.title
    ? `${rich.title} - ${config.get("general.appName")}`
    : `${title} - ${config.get("general.appName")}`;

  const metaDescription =
    rich?.description ??
    (rich
      ? `${rich.fileCount} file${rich.fileCount === 1 ? "" : "s"} · ${byteToHumanSizeString(rich.size ?? 0)}`
      : (description ?? DEFAULT_DESCRIPTION));

  const media = rich?.media;
  const shareUrl =
    embed && shareId ? `${embed.appUrl}/share/${shareId}` : undefined;

  return (
    <Head>
      <title>{metaTitle}</title>
      <meta property="og:title" content={metaTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:site_name" content={config.get("general.appName")} />
      {shareUrl && <meta property="og:url" content={shareUrl} />}
      <meta name="twitter:title" content={metaTitle} />
      <meta name="twitter:description" content={metaDescription} />

      {media?.kind === "image" && (
        <>
          <meta property="og:type" content="website" />
          <meta property="og:image" content={media.url} />
          <meta property="og:image:type" content={media.mimeType} />
          {media.width && media.height && (
            <>
              <meta property="og:image:width" content={String(media.width)} />
              <meta property="og:image:height" content={String(media.height)} />
            </>
          )}
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:image" content={media.url} />
        </>
      )}
      {media?.kind === "video" && (
        <>
          <meta property="og:type" content="video.other" />
          <meta property="og:video" content={media.url} />
          <meta property="og:video:url" content={media.url} />
          <meta property="og:video:secure_url" content={media.url} />
          <meta property="og:video:type" content={media.mimeType} />
          <meta name="twitter:card" content="player" />
          <meta name="twitter:player:stream" content={media.url} />
          <meta
            name="twitter:player:stream:content_type"
            content={media.mimeType}
          />
        </>
      )}
      {media?.kind === "audio" && (
        <>
          <meta property="og:type" content="music.song" />
          <meta property="og:audio" content={media.url} />
          <meta property="og:audio:type" content={media.mimeType} />
        </>
      )}
      {!media && <meta name="twitter:card" content="summary" />}
    </Head>
  );
};

export default Meta;
