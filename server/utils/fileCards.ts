import escape from "escape-html";

/** The team's Nextcloud, the only one whose public shares become cards. */
export const nextcloudHost = "cloud.hoffman-institut.ru";

const yandexHost =
  /^(?:disk\.(?:360\.)?yandex\.(?:ru|com|by|kz|uz|com\.tr)|yadi\.sk)$/;

export type FileSource =
  | { service: "yandex"; url: string; key: string; path?: string }
  | { service: "nextcloud"; url: string; token: string };

export type FileItem = {
  name: string;
  folder?: boolean;
  size?: number;
  mime?: string;
  /** Link to the item on the service. */
  url: string;
  /** Image of the item, if the service has one. */
  preview?: string;
  /** The file itself, for playing videos. */
  file?: string;
};

export type FileCard = FileItem & {
  service: FileSource["service"];
  /** Items of a folder, the first ones. */
  items?: FileItem[];
  total?: number;
};

/**
 * Recognizes public links of Yandex Disk and of the team's Nextcloud.
 *
 * @param href - the link.
 * @returns where the file is, or undefined for other links.
 */
export function fileSource(href: string): FileSource | undefined {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:") {
    return undefined;
  }
  if (yandexHost.test(url.hostname)) {
    const match = url.pathname.match(/^\/([di])\/([\w-]+)(\/[^?#]*)?\/?$/);
    if (!match) {
      return undefined;
    }
    let path: string | undefined;
    try {
      path = match[3] ? decodeURIComponent(match[3]) : undefined;
    } catch {
      return undefined;
    }
    return {
      service: "yandex",
      url: url.href,
      key: `https://disk.yandex.ru/${match[1]}/${match[2]}`,
      path: path && path !== "/" ? path : undefined,
    };
  }
  if (url.hostname === nextcloudHost) {
    const match = url.pathname.match(
      /^\/(?:index\.php\/)?s\/([A-Za-z0-9]{6,64})\/?$/
    );
    return match
      ? { service: "nextcloud", url: url.href, token: match[1] }
      : undefined;
  }
  return undefined;
}

type YandexResource = {
  name?: string;
  type?: string;
  path?: string;
  size?: number;
  mime_type?: string;
  preview?: string;
  file?: string;
  _embedded?: { total?: number; items?: YandexResource[] };
};

/**
 * Builds a card from a resource of the Yandex Disk public API.
 *
 * @param source - the link the card is for.
 * @param resource - the answer of v1/disk/public/resources.
 * @returns the card.
 */
export function yandexCard(
  source: Extract<FileSource, { service: "yandex" }>,
  resource: YandexResource
): FileCard {
  const item = (r: YandexResource): FileItem => ({
    name: r.name ?? "",
    folder: r.type === "dir",
    size: r.size,
    mime: r.mime_type,
    url: r.path ? `${source.key}${encodeURI(r.path)}` : source.url,
    preview: r.preview,
    file: r.file,
  });
  return {
    ...item(resource),
    url: source.url,
    service: "yandex",
    items: resource._embedded?.items?.map(item),
    total: resource._embedded?.total,
  };
}

const entities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const unescapeXML = (text: string) =>
  text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (all, code: string) => {
    if (code[0] === "#") {
      const n =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : all;
    }
    return entities[code] ?? all;
  });

/** Properties asked from Nextcloud for a public share. */
export const propfindBody = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop><d:displayname/><d:getcontenttype/><d:getcontentlength/><d:resourcetype/><oc:size/><nc:has-preview/></d:prop>
</d:propfind>`;

/**
 * Builds a card from the WebDAV answer for a public Nextcloud share.
 *
 * @param source - the link the card is for.
 * @param xml - the PROPFIND answer for public.php/webdav with depth 1.
 * @param limit - how many items of a folder to keep.
 * @returns the card, or undefined if the answer has no share.
 */
export function nextcloudCard(
  source: Extract<FileSource, { service: "nextcloud" }>,
  xml: string,
  limit = 12
): FileCard | undefined {
  const base = `https://${nextcloudHost}`;
  const responses = xml.match(/<d:response>[\s\S]*?<\/d:response>/g) ?? [];
  const items = responses.flatMap((response) => {
    const prop = (name: string) => {
      const match = response.match(
        new RegExp(`<(?:d|oc|nc):${name}>([^<]*)</(?:d|oc|nc):${name}>`)
      );
      return match ? unescapeXML(match[1]) : undefined;
    };
    const href = prop("href");
    if (href === undefined) {
      return [];
    }
    let path: string;
    try {
      path = decodeURIComponent(href.replace(/^\/public\.php\/webdav/, ""));
    } catch {
      return [];
    }
    const folder = /<d:collection\s*\/>/.test(response);
    const size = Number(prop("getcontentlength") ?? prop("size"));
    return [
      {
        path: path || "/",
        folder,
        name: prop("displayname") || path.split("/").filter(Boolean).pop(),
        size: Number.isFinite(size) ? size : undefined,
        mime: prop("getcontenttype"),
        hasPreview: prop("has-preview") === "true",
      },
    ];
  });
  const [root, ...children] = items;
  if (!root) {
    return undefined;
  }
  const share = `${base}/s/${source.token}`;
  const previews = `${base}/index.php/apps/files_sharing/publicpreview/${source.token}`;
  const dav = `${base}/public.php/dav/files/${source.token}`;
  return {
    service: "nextcloud",
    name: root.name ?? "",
    folder: root.folder,
    size: root.size,
    mime: root.mime,
    url: share,
    preview: root.hasPreview ? `${previews}?x=1600&y=1200&a=true` : undefined,
    file: root.folder ? undefined : dav,
    total: root.folder ? children.length : undefined,
    items: root.folder
      ? children.slice(0, limit).map((child) => ({
          name: child.name ?? "",
          folder: child.folder,
          size: child.size,
          mime: child.mime,
          url: share,
          preview: child.hasPreview
            ? `${previews}?file=${encodeURIComponent(child.path)}&x=400&y=400&a=true`
            : undefined,
          file: child.folder ? undefined : `${dav}${encodeURI(child.path)}`,
        }))
      : undefined,
  };
}

/**
 * Formats a file size the Russian way.
 *
 * @param bytes - the size.
 * @returns the size like "4,2 МБ".
 */
export function fileSize(bytes?: number) {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return "";
  }
  const units = ["Б", "КБ", "МБ", "ГБ", "ТБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  const text = unit === 0 || value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${text.replace(".", ",")} ${units[unit]}`;
}

/**
 * Picks an emoji for the kind of a file.
 *
 * @param item - the file or folder.
 * @returns the emoji.
 */
export function fileIcon(item: Pick<FileItem, "folder" | "mime" | "name">) {
  const mime = item.mime ?? "";
  const name = item.name.toLowerCase();
  if (item.folder) {
    return "📁";
  }
  if (mime.startsWith("image/")) {
    return "🖼️";
  }
  if (mime.startsWith("video/")) {
    return "🎬";
  }
  if (mime.startsWith("audio/")) {
    return "🎵";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "📕";
  }
  if (/sheet|excel|csv/.test(mime) || /\.(xlsx?|csv|ods)$/.test(name)) {
    return "📊";
  }
  if (/presentation|powerpoint/.test(mime) || /\.(pptx?|odp)$/.test(name)) {
    return "📽️";
  }
  if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z|tgz|gz)$/.test(name)) {
    return "🗜️";
  }
  if (/word|document|text/.test(mime) || /\.(docx?|odt|txt|rtf)$/.test(name)) {
    return "📝";
  }
  return "📄";
}

const serviceName = {
  yandex: "Яндекс Диск",
  nextcloud: "Nextcloud",
};

const attr = (value: string) => escape(value);

/**
 * Renders the body of a card: a picture, a player or the first items of a
 * folder, and a bar with the name and links.
 *
 * @param card - the card, or undefined when the file was not read.
 * @param href - the link the card is for.
 * @param service - the service of the link.
 * @param read - whether reading the file was tried.
 * @returns HTML for the body of the card page.
 */
export function fileCardHTML(
  card: FileCard | undefined,
  href: string,
  service: FileSource["service"],
  read = true
) {
  const link = (url: string, content: string, className = "") =>
    `<a${className ? ` class="${className}"` : ""} href="${attr(url)}" target="_blank" rel="noopener noreferrer">${content}</a>`;

  if (!card) {
    return `<div class="card"><div class="bar"><span class="icon">🔒</span><div class="meta">${link(href, "Открыть файл", "name")}<div class="sub">${serviceName[service]}${read ? " · нет доступа по ссылке или ссылка удалена" : ""}</div></div></div></div>`;
  }

  const isImage = card.mime?.startsWith("image/");
  const isVideo = card.mime?.startsWith("video/");
  let media = "";
  if (isVideo && card.file) {
    media = `<video controls preload="metadata" src="${attr(card.file)}"${card.preview ? ` poster="${attr(card.preview)}"` : ""}></video>`;
  } else if ((isImage || card.preview) && card.preview && !card.folder) {
    media = link(
      card.url,
      `<img class="picture" src="${attr(card.preview)}" alt="${attr(card.name)}">`
    );
  } else if (card.folder && card.items?.length) {
    const tiles = card.items
      .map((item) =>
        link(
          item.url,
          `${item.preview ? `<img src="${attr(item.preview)}" alt="" loading="lazy">` : `<span class="tile-icon">${fileIcon(item)}</span>`}<span class="tile-name">${escape(item.name)}</span>`,
          "tile"
        )
      )
      .join("");
    const more =
      card.total && card.total > card.items.length
        ? link(
            card.url,
            `<span class="tile-icon">…</span><span class="tile-name">ещё ${card.total - card.items.length}</span>`,
            "tile"
          )
        : "";
    media = `<div class="tiles">${tiles}${more}</div>`;
  }

  const details = [
    serviceName[card.service],
    card.folder
      ? card.total !== undefined
        ? `${card.total} в папке`
        : "папка"
      : fileSize(card.size),
  ]
    .filter(Boolean)
    .join(" · ");

  const download =
    card.file && !card.folder ? link(card.file, "Скачать", "button") : "";

  return `<div class="card">${media}<div class="bar"><span class="icon">${fileIcon(card)}</span><div class="meta">${link(card.url, escape(card.name || "Без названия"), "name")}<div class="sub">${escape(details)}</div></div>${download}${link(card.url, "Открыть", "button")}</div></div>`;
}

/** Styles of the card page, light and dark. */
export const fileCardStyles = `
:root { --text: #111319; --sub: #737a86; --line: #e8ebed; --back: #fff; --tile: #f4f5f7; --accent: #0366d6; }
:root.dark { --text: #e6e6e6; --sub: #9ba3af; --line: #2c3036; --back: #1f2128; --tile: #2a2d34; --accent: #4e9bf8; }
html, body { margin: 0; padding: 0; background: transparent; }
body { font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: var(--text); }
a { color: inherit; text-decoration: none; }
.card { background: var(--back); border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.picture { display: block; width: 100%; max-height: 520px; object-fit: contain; background: var(--tile); }
video { display: block; width: 100%; max-height: 520px; background: #000; }
.tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; padding: 10px; border-bottom: 1px solid var(--line); }
.tile { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tile img, .tile-icon { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 4px; background: var(--tile); }
.tile-icon { display: flex; align-items: center; justify-content: center; font-size: 32px; }
.tile-name { font-size: 12px; color: var(--sub); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.picture + .bar, video + .bar, a + .bar { border-top: 1px solid var(--line); }
.icon { font-size: 22px; line-height: 1; }
.meta { flex: 1; min-width: 0; }
.name { display: block; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.name:hover { color: var(--accent); }
.sub { font-size: 12px; color: var(--sub); }
.button { flex-shrink: 0; padding: 4px 10px; border: 1px solid var(--line); border-radius: 4px; font-size: 13px; }
.button:hover { color: var(--accent); border-color: var(--accent); }
`;
