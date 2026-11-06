import { Table, TBody, TR, TD } from "oy-vey";
import * as React from "react";
import env from "@server/env";
import { Colors, fontFamily, instituteLogoUrl } from "./brand";
import { useEmailTranslation } from "./EmailContext";

const url = env.CDN_URL ?? env.URL;

/**
 * Card header: the Institute logo on the accent plate, the Outline logo and
 * the service name.
 */
export default () => {
  const t = useEmailTranslation();

  return (
    <Table
      width="100%"
      role="presentation"
      cellPadding="0"
      cellSpacing="0"
      border="0"
    >
      <TBody>
        <TR>
          <TD
            className="hi-pad"
            style={{
              padding: "22px 32px 18px",
              borderBottom: `1px solid ${Colors.line}`,
            }}
          >
            <Table
              role="presentation"
              cellPadding="0"
              cellSpacing="0"
              border="0"
            >
              <TBody>
                <TR>
                  <TD
                    valign="middle"
                    bgcolor={Colors.accent}
                    style={{
                      backgroundColor: Colors.accent,
                      borderRadius: "6px",
                      padding: "6px 12px",
                    }}
                  >
                    <img
                      src={instituteLogoUrl}
                      width="119"
                      height="50"
                      alt={t("Hoffman Institute")}
                      style={{
                        display: "block",
                        border: 0,
                        fontFamily,
                        fontSize: "14px",
                        lineHeight: "18px",
                        fontWeight: "bold",
                        color: "#ffffff",
                      }}
                    />
                  </TD>
                  <TD
                    width="16"
                    style={{ width: "16px", fontSize: 0, lineHeight: 0 }}
                    dangerouslySetInnerHTML={{ __html: "&nbsp;" }}
                  />
                  <TD
                    valign="middle"
                    style={{
                      padding: "0 0 0 16px",
                      borderLeft: `1px solid ${Colors.line}`,
                    }}
                  >
                    <img
                      src={
                        env.isCloudHosted
                          ? `${url}/email/outline-logo.png`
                          : "cid:outline-logo"
                      }
                      width="83"
                      height="20"
                      alt={env.APP_NAME}
                      style={{
                        display: "block",
                        border: 0,
                        fontFamily,
                        fontSize: "14px",
                        lineHeight: "18px",
                        color: Colors.muted,
                      }}
                    />
                  </TD>
                </TR>
              </TBody>
            </Table>
            <p
              style={{
                margin: "10px 0 0",
                fontFamily,
                fontSize: "13px",
                lineHeight: "18px",
                color: Colors.muted,
              }}
            >
              {t("Corporate wiki")}
            </p>
          </TD>
        </TR>
      </TBody>
    </Table>
  );
};
