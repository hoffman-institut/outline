import { Table, TBody, TR, TD } from "oy-vey";
import * as React from "react";
import { Colors, fontFamily } from "./brand";

type Props = {
  /** Bold first line of the box. */
  title: string;
  /** List items. */
  items: React.ReactNode[];
};

const itemStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontFamily,
  fontSize: "15px",
  lineHeight: "22px",
  color: Colors.text,
};

/** Highlighted box with a title and a short list, e.g. what to know about a link. */
const Callout = ({ title, items }: Props) => (
  <Table
    width="100%"
    role="presentation"
    cellPadding="0"
    cellSpacing="0"
    border="0"
    bgcolor={Colors.soft}
    style={{
      margin: "0 0 20px",
      backgroundColor: Colors.soft,
      borderLeft: `4px solid ${Colors.accent}`,
      borderRadius: "4px",
    }}
  >
    <TBody>
      <TR>
        <TD style={{ padding: "14px 18px 8px" }}>
          <p
            style={{
              margin: "0 0 8px",
              fontFamily,
              fontSize: "15px",
              lineHeight: "22px",
              fontWeight: "bold",
              color: Colors.head,
            }}
          >
            {title}
          </p>
          <ul style={{ margin: 0, padding: "0 0 0 20px" }}>
            {items.map((item, index) => (
              <li key={index} style={itemStyle}>
                {item}
              </li>
            ))}
          </ul>
        </TD>
      </TR>
    </TBody>
  </Table>
);

export default Callout;
