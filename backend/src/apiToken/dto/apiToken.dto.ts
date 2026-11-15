import { ApiToken } from "@prisma/client";

export class ApiTokenDTO {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: Date;
  expiresAt: Date | null;
  lastUsedAt: Date | null;

  static from(token: ApiToken): ApiTokenDTO {
    // tokenHash is deliberately never exposed
    return {
      id: token.id,
      name: token.name,
      prefix: token.prefix,
      scopes: token.scopes.split(",").filter(Boolean),
      createdAt: token.createdAt,
      expiresAt: token.expiresAt,
      lastUsedAt: token.lastUsedAt,
    };
  }
}
