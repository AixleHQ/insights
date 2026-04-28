import { config } from "./config";

export const rollbarConfig = {
  accessToken: config.rollbarClientToken,
  enabled: !!config.rollbarClientToken,
  environment: import.meta.env.MODE,
  captureUncaught: true,
  captureUnhandledRejections: true,
};
