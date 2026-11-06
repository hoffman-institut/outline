import { Table, TBody, TR, TD } from "oy-vey";
import * as React from "react";
import { Colors, fontFamily } from "./brand";

const Body: React.FC<React.PropsWithChildren> = ({ children }) => (
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
          className="hi-pad hi-body"
          style={{
            padding: "28px 32px 12px",
            fontFamily,
            fontSize: "16px",
            lineHeight: "24px",
            color: Colors.text,
          }}
        >
          {children}
        </TD>
      </TR>
    </TBody>
  </Table>
);

export default Body;
