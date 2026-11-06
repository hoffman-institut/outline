import { Table, TBody, TR, TD } from "oy-vey";
import * as React from "react";
import { Colors, fontFamily } from "./brand";
import Footer from "./Footer";

const EmailLayout: React.FC<
  React.PropsWithChildren<{
    bgcolor?: string;
    previewText: string;
    goToAction?: { url: string; name: string };
  }>
> = ({ previewText, bgcolor = Colors.soft, goToAction, children }) => {
  let markup;
  if (goToAction) {
    markup = JSON.stringify({
      "@context": "http://schema.org",
      "@type": "EmailMessage",
      potentialAction: {
        "@type": "ViewAction",
        url: goToAction.url,
        name: goToAction.name,
      },
    });
  }

  // The footer goes under the card; emails without one get the default footer.
  const items = React.Children.toArray(children);
  const footers = items.filter(
    (item) => React.isValidElement(item) && item.type === Footer
  );
  const content = items.filter((item) => !footers.includes(item));

  return (
    <>
      {markup ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: markup }}
        />
      ) : null}
      <Table
        bgcolor={bgcolor}
        id="__bodyTable__"
        width="100%"
        role="presentation"
        cellPadding="0"
        cellSpacing="0"
        border="0"
        style={{
          WebkitFontSmoothing: "antialiased",
          width: "100% !important",
          background: `${bgcolor}`,
          WebkitTextSizeAdjust: "none",
          margin: 0,
          padding: 0,
          minWidth: "100%",
        }}
      >
        <TR>
          <TD align="center" style={{ padding: "24px 12px" }}>
            <span
              style={{
                display: "none !important",
                color: `${bgcolor}`,
                margin: 0,
                padding: 0,
                fontSize: "1px",
                lineHeight: "1px",
              }}
            >
              {previewText}
            </span>
            <Table
              className="hi-container"
              width="600"
              role="presentation"
              cellPadding="0"
              cellSpacing="0"
              border="0"
              bgcolor="#ffffff"
              style={{
                width: "600px",
                maxWidth: "600px",
                backgroundColor: "#ffffff",
                border: `1px solid ${Colors.line}`,
                borderTop: `4px solid ${Colors.accent}`,
                borderRadius: "8px",
              }}
            >
              <TBody>
                <TR>
                  <TD align="left">{content}</TD>
                </TR>
              </TBody>
            </Table>
            <Table
              className="hi-container"
              width="600"
              role="presentation"
              cellPadding="0"
              cellSpacing="0"
              border="0"
              style={{ width: "600px", maxWidth: "600px" }}
            >
              <TBody>
                <TR>
                  <TD
                    className="hi-pad"
                    align="center"
                    style={{ padding: "16px 32px 8px" }}
                  >
                    {footers.length ? footers : <Footer />}
                  </TD>
                </TR>
              </TBody>
            </Table>
          </TD>
        </TR>
      </Table>
    </>
  );
};

export default EmailLayout;

export const baseStyles = `
  #__bodyTable__ {
    font-family: ${fontFamily};
    font-size: 16px;
    line-height: 1.5;
  }

  .hi-body p {
    margin: 0 0 16px;
  }

  .hi-body a {
    color: ${Colors.accent};
  }

  @media only screen and (max-width: 620px) {
    .hi-container {
      width: 100% !important;
    }

    .hi-pad {
      padding-left: 20px !important;
      padding-right: 20px !important;
    }
  }
`;
