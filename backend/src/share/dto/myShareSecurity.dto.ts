import { Expose } from "class-transformer";

export class MyShareSecurityDTO {
  @Expose()
  passwordProtected: boolean;

  @Expose()
  maxViews: number;

  @Expose()
  restrictToRecipients: boolean;

  @Expose()
  oneTimeDownload: boolean;

  @Expose()
  embedsDisabled: boolean;
}
