import * as React from "react";
import { useTheme } from "styled-components";
import Frame from "../components/Frame";
import type { EmbedProps as Props } from ".";

/** A card for a public link of Yandex Disk or Nextcloud, see /embeds/files. */
function FileCard(props: Props) {
  const theme = useTheme();
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(64);

  React.useEffect(() => {
    const handler = (event: MessageEvent<{ type: string; value: number }>) => {
      const contentWindow =
        frame.current?.contentWindow ||
        frame.current?.contentDocument?.defaultView;
      if (
        event.data.type === "frame-resized" &&
        event.source === contentWindow
      ) {
        setHeight(Math.ceil(event.data.value));
      }
    };
    window.addEventListener("message", handler);

    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <Frame
      ref={frame}
      src={`/embeds/files?url=${encodeURIComponent(props.attrs.href)}${
        theme.isDark ? "&dark=1" : ""
      }`}
      className={props.isSelected ? "ProseMirror-selectednode" : ""}
      width="100%"
      height={`${height}px`}
      border={false}
      title={props.embed.title}
    />
  );
}

export default FileCard;
