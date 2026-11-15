import {
  ArrayNotEmpty,
  ArrayUnique,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from "class-validator";
import { API_TOKEN_SCOPES } from "../apiToken.constants";

export class CreateApiTokenDTO {
  @IsString()
  @Length(1, 50)
  name: string;

  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(API_TOKEN_SCOPES, { each: true })
  scopes: string[];

  // Number of days until the token expires. Omit for a token that never expires.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3650)
  expiresInDays?: number;
}
