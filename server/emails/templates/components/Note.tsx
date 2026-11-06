import * as React from "react";
import { Colors, fontFamily } from "./brand";

const style: React.CSSProperties = {
  margin: "0 0 16px",
  fontFamily,
  fontSize: "14px",
  lineHeight: "21px",
  color: Colors.muted,
};

/** Secondary text at the end of an email, e.g. what to do if it came by mistake. */
const Note: React.FC<React.PropsWithChildren> = ({ children }) => (
  <p style={style}>{children}</p>
);

export default Note;
