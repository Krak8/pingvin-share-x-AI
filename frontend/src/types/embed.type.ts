// Public link preview data of a share, see GET /api/shares/:id/embed
export type EmbedInfo = {
  generic: boolean;
  appName: string;
  appUrl: string;
  title?: string;
  description?: string;
  fileCount?: number;
  size?: number;
  expiration?: string;
  media?: {
    kind: "image" | "video" | "audio";
    mimeType: string;
    fileName: string;
    url: string;
  };
};
