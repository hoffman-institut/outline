import type { Context } from "koa";
import { InvalidRequestError } from "@server/errors";
import fetch from "@server/utils/fetch";
import type { FileSource } from "@server/utils/fileCards";
import {
  fileCardHTML,
  fileCardStyles,
  fileSource,
  nextcloudCard,
  nextcloudHost,
  propfindBody,
  yandexCard,
} from "@server/utils/fileCards";
import { iframeCheckScript, resizeObserverScript } from "./embeds";

const timeout = 8000;

async function loadCard(source: FileSource) {
  if (source.service === "yandex") {
    const params = new URLSearchParams({
      public_key: source.key,
      limit: "12",
      preview_size: "XL",
      preview_crop: "false",
    });
    if (source.path) {
      params.set("path", source.path);
    }
    const res = await fetch(
      `https://cloud-api.yandex.net/v1/disk/public/resources?${params}`,
      { timeout }
    );
    return res.ok ? yandexCard(source, await res.json()) : undefined;
  }

  const res = await fetch(`https://${nextcloudHost}/public.php/webdav/`, {
    method: "PROPFIND",
    timeout,
    headers: {
      Authorization: `Basic ${Buffer.from(`${source.token}:`).toString("base64")}`,
      Depth: "1",
      "Content-Type": "application/xml",
    },
    body: propfindBody,
  });
  return res.status === 207
    ? nextcloudCard(source, await res.text())
    : undefined;
}

/**
 * Renders a card for a public link of Yandex Disk or of the team's Nextcloud:
 * a picture, a video, a file or the first items of a folder. Neither service
 * may be framed, so the card is built from their APIs on the server. Only
 * signed in users get the contents, so that the services are not asked for
 * strangers.
 *
 * @param ctx - the koa context.
 */
export const renderFileCard = async (ctx: Context) => {
  const source = fileSource(String(ctx.query.url ?? ""));
  if (!source) {
    throw InvalidRequestError("Unsupported URL");
  }

  const signedIn = !!ctx.state.auth?.user;
  const card = signedIn
    ? await loadCard(source).catch(() => undefined)
    : undefined;

  ctx.set("X-Frame-Options", "sameorigin");
  ctx.set("Cache-Control", "private, max-age=300");
  ctx.type = "html";
  ctx.body = `<!doctype html>
<html${ctx.query.dark === "1" ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8">
<style>${fileCardStyles}</style>
${iframeCheckScript(ctx)}
</head>
<body>
${fileCardHTML(card, source.url, source.service, signedIn)}
${resizeObserverScript(ctx)}
</body>
</html>`;
};
