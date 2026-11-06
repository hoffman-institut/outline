import { t as i18nT } from "i18next";
import * as React from "react";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * Translation function of the email being rendered, so that shared parts such
 * as the header and footer use the language of the recipient.
 */
export const EmailContext = React.createContext<Translate>(
  (key, options) => i18nT(key, { ...options }) as string
);

export const useEmailTranslation = () => React.useContext(EmailContext);
