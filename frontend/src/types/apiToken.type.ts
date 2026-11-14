export type ApiTokenScope = "upload" | "read" | "manage";

export type ApiToken = {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
};

export type CreateApiToken = {
  name: string;
  scopes: ApiTokenScope[];
  expiresInDays?: number;
};

// The plain token is only part of the response that creates the token
export type CreatedApiToken = ApiToken & { token: string };
