import { ApiTokenScope } from "../types/apiToken.type";

export type ApiExample = {
  id: "upload" | "list" | "download" | "delete";
  code: string;
};

/** Ready to paste curl commands that match what a token is allowed to do */
export const getCurlExamples = (
  baseUrl: string,
  token: string,
  scopes: ApiTokenScope[],
): ApiExample[] => {
  const auth = `-H "Authorization: Bearer ${token}"`;
  const examples: ApiExample[] = [];

  if (scopes.includes("upload")) {
    examples.push({
      id: "upload",
      code: `curl ${auth} \\\n     -F "file=@file.zip" ${baseUrl}/api/upload`,
    });
  }
  if (scopes.includes("read")) {
    examples.push(
      { id: "list", code: `curl ${auth} ${baseUrl}/api/shares` },
      {
        id: "download",
        code: `curl -OJ ${baseUrl}/api/d/<share-id>/<file-name>`,
      },
    );
  }
  if (scopes.includes("manage")) {
    examples.push({
      id: "delete",
      code: `curl -X DELETE ${auth} \\\n     ${baseUrl}/api/shares/<share-id>`,
    });
  }

  return examples;
};

/** A custom uploader for ShareX (https://getsharex.com) that uploads to this instance */
export const buildShareXConfig = (
  baseUrl: string,
  token: string,
  appName: string,
) =>
  JSON.stringify(
    {
      Version: "13.7.0",
      Name: appName,
      DestinationType: "ImageUploader, TextUploader, FileUploader",
      RequestMethod: "POST",
      RequestURL: `${baseUrl}/api/upload`,
      Headers: { Authorization: `Bearer ${token}` },
      Body: "MultipartFormData",
      FileFormName: "file",
      URL: "{json:directUrl}",
      ErrorMessage: "{json:message}",
    },
    null,
    2,
  );

export const downloadTextFile = (
  fileName: string,
  content: string,
  mimeType = "application/json",
) => {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};
