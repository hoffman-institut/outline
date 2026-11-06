import * as React from "react";
import { Colors, fontFamily } from "./brand";

const style: React.CSSProperties = {
  margin: "0 0 16px",
  fontFamily,
  fontSize: "22px",
  lineHeight: "30px",
  fontWeight: "bold",
  color: Colors.head,
};

const Heading: React.FC<React.PropsWithChildren> = ({ children }) => (
  <h1 style={style}>{children}</h1>
);

export default Heading;
