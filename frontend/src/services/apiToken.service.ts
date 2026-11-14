import {
  ApiToken,
  CreateApiToken,
  CreatedApiToken,
} from "../types/apiToken.type";
import api from "./api.service";

const list = async (): Promise<ApiToken[]> => {
  return (await api.get("apiTokens")).data;
};

const create = async (token: CreateApiToken): Promise<CreatedApiToken> => {
  return (await api.post("apiTokens", token)).data;
};

const revoke = async (id: string) => {
  await api.delete(`apiTokens/${id}`);
};

export default { list, create, revoke };
