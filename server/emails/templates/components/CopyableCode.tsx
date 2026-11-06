import * as React from "react";
import { Colors } from "./brand";

const style: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize: "30px",
  lineHeight: "36px",
  display: "inline-block",
  margin: "4px 0 20px",
  padding: "14px 24px",
  color: Colors.head,
  background: Colors.soft,
  border: `1px solid ${Colors.line}`,
  fontWeight: "bold",
  borderRadius: "6px",
  letterSpacing: "6px",
};

const CopyableCode: React.FC<React.PropsWithChildren> = (props) => (
  <pre {...props} style={style}>
    {props.children}
  </pre>
);

export default CopyableCode;
