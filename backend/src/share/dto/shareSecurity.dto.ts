import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Length,
} from "class-validator";

export class ShareSecurityDTO {
  @IsString()
  @IsOptional()
  @Length(3, 30)
  password: string;

  @IsNumber()
  @IsOptional()
  maxViews: number;

  @IsBoolean()
  @IsOptional()
  restrictToRecipients: boolean;

  // Share expires right after its first download
  @IsBoolean()
  @IsOptional()
  oneTimeDownload: boolean;

  // Opt out of Discord/OpenGraph link previews for this share
  @IsBoolean()
  @IsOptional()
  embedsDisabled: boolean;
}
