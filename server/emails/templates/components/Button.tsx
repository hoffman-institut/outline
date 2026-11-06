import * as React from "react";
import { Colors, fontFamily } from "./brand";

type Props = {
  href: string;
};

const style: React.CSSProperties = {
  display: "inline-block",
  padding: "13px 28px",
  fontFamily,
  fontSize: "16px",
  lineHeight: "20px",
  fontWeight: "bold",
  color: "#ffffff",
  background: Colors.accent,
  border: `1px solid ${Colors.accent}`,
  borderRadius: "6px",
  textDecoration: "none",
  cursor: "pointer",
};

const Button: React.FC<React.PropsWithChildren<Props>> = (props) => (
  <a {...props} style={style} className="email-button">
    {props.children}
  </a>
);

export default Button;
