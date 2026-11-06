import * as React from "react";
import env from "@server/env";
import { Colors, fontFamily } from "./brand";
import { useEmailTranslation } from "./EmailContext";

type Props = {
  unsubscribeUrl?: string;
  unsubscribeText?: string;
  children?: React.ReactNode;
};

const textStyle: React.CSSProperties = {
  margin: 0,
  fontFamily,
  fontSize: "12px",
  lineHeight: "18px",
  color: Colors.muted,
};

export const Link = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => {
  const linkStyle = {
    color: Colors.muted,
    textDecoration: "underline",
    margin: "0 6px",
  };

  return (
    <a href={href} style={linkStyle}>
      {children}
    </a>
  );
};

/**
 * Footer under the card: who sent the email and where to ask questions,
 * followed by the unsubscribe links of notification emails. EmailLayout moves
 * it out of the card.
 */
export default ({ unsubscribeUrl, unsubscribeText, children }: Props) => {
  const t = useEmailTranslation();
  const host = env.URL.replace(/^https?:\/\//, "");

  return (
    <>
      <p style={textStyle}>
        {t("This email was sent by the Hoffman Institute corporate wiki")} —{" "}
        <a
          href={env.URL}
          style={{ color: Colors.muted, textDecoration: "underline" }}
        >
          {host}
        </a>
        . {t("Questions? Ask in the “техподдержка” channel in Mattermost.")}
      </p>
      {(unsubscribeUrl || children) && (
        <p style={{ ...textStyle, marginTop: "8px" }}>
          {unsubscribeUrl && (
            <Link href={unsubscribeUrl}>
              {unsubscribeText ?? t("Unsubscribe from these emails")}
            </Link>
          )}
          {children}
        </p>
      )}
    </>
  );
};
