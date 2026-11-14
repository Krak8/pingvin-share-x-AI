import { BadRequestException } from "@nestjs/common";
import * as crypto from "crypto";

export type UploadOptions = {
  id: string;
  name?: string;
  description?: string;
  expiration: string;
  password?: string;
  maxViews?: number;
  oneTimeDownload: boolean;
  embedsDisabled: boolean;
};

const SHORTHAND_UNITS: Record<string, string> = {
  min: "minutes",
  h: "hours",
  d: "days",
  w: "weeks",
  mo: "months",
  y: "years",
};

/**
 * Turns the friendly curl style expiration ("30min", "12h", "7d", "2w", "3mo",
 * "1y", "never") into the format the share service understands ("7-days").
 * Everything else (e.g. "7-days" or an ISO date) is passed through and gets
 * validated by the share service.
 */
export function normalizeExpiration(
  input: string | undefined,
  fallback: { value: number; unit: string },
): string {
  const value = input?.trim();

  if (!value) {
    return fallback.value > 0 ? `${fallback.value}-${fallback.unit}` : "never";
  }

  const shorthand = /^(\d+)(min|h|d|w|mo|y)$/i.exec(value);
  if (shorthand) {
    return `${parseInt(shorthand[1])}-${SHORTHAND_UNITS[shorthand[2].toLowerCase()]}`;
  }

  return value.toLowerCase() === "never" ? "never" : value;
}

const ID_ALPHABET =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function generateShareId(length: number): string {
  const safeLength = Math.max(length || 0, 8);
  let id = "";
  for (let i = 0; i < safeLength; i++) {
    id += ID_ALPHABET[crypto.randomInt(ID_ALPHABET.length)];
  }
  return id;
}

/**
 * Reduces whatever the client sent to a plain file name. Folder structures are
 * dropped, so a client can never influence where anything is stored.
 */
export function sanitizeFileName(raw: string | undefined): string | null {
  if (!raw) return null;

  const base = raw.split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  if (!cleaned || cleaned === "." || cleaned === "..") return null;
  return cleaned.slice(0, 255);
}

/** Appends " (2)", " (3)" ... so every file in a share has a unique name */
export function makeUniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;

  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";

  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

function isTruthy(value: unknown): boolean {
  return (
    value === true ||
    (typeof value === "string" &&
      ["1", "true", "yes", "on"].includes(value.toLowerCase()))
  );
}

function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) value = value[value.length - 1];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * Validates the options of an upload request. The same names are used as form
 * fields (multipart upload) and as query parameters (PUT upload):
 * expires, password, maxViews, name, description, id, oneTime, noEmbed
 */
export function parseUploadOptions(
  raw: Record<string, unknown>,
  defaults: {
    expiration: { value: number; unit: string };
    idLength: number;
  },
): UploadOptions {
  const errors: string[] = [];

  const id = asString(raw.id) ?? generateShareId(defaults.idLength);
  if (!/^[a-zA-Z0-9_-]{3,50}$/.test(id)) {
    errors.push("id must be 3-50 characters of a-z, A-Z, 0-9, _ or -");
  }

  const name = asString(raw.name);
  if (name && (name.length < 3 || name.length > 30)) {
    errors.push("name must be between 3 and 30 characters");
  }

  const description = asString(raw.description);
  if (description && description.length > 512) {
    errors.push("description must be at most 512 characters");
  }

  const password = asString(raw.password);
  if (password && (password.length < 3 || password.length > 30)) {
    errors.push("password must be between 3 and 30 characters");
  }

  let maxViews: number | undefined;
  const maxViewsRaw = asString(raw.maxViews);
  if (maxViewsRaw !== undefined) {
    maxViews = Number(maxViewsRaw);
    if (!Number.isInteger(maxViews) || maxViews < 1 || maxViews > 1_000_000) {
      errors.push("maxViews must be a positive whole number");
    }
  }

  if (errors.length > 0) throw new BadRequestException(errors);

  return {
    id,
    name,
    description,
    password,
    maxViews,
    expiration: normalizeExpiration(
      asString(raw.expires) ?? asString(raw.expiration),
      defaults.expiration,
    ),
    oneTimeDownload: isTruthy(asString(raw.oneTime)),
    embedsDisabled: isTruthy(asString(raw.noEmbed)),
  };
}
