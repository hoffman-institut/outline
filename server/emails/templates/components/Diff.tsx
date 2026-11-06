import * as React from "react";
import { Colors } from "./brand";

type Props = {
  children: React.ReactNode;
  href?: string;
};

export default ({ children, ...rest }: Props) => {
  const style = {
    border: `1px solid ${Colors.line}`,
    borderRadius: "6px",
    padding: ".75em 1em",
    color: Colors.text,
    backgroundColor: Colors.soft,
    display: "block",
    textDecoration: "none",
    boxSizing: "border-box" as const,
    width: "100%",
  };

  return (
    <div style={style} className="content-diff" {...rest}>
      {children}
    </div>
  );
};
