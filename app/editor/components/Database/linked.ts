import type { Node as ProsemirrorNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import * as React from "react";
import type { DatabaseData, DatabaseRef } from "@shared/editor/lib/database";
import { normalizeDatabase } from "@shared/editor/lib/database";
import { databaseFromNode } from "@shared/editor/nodes/Database";
import { DATABASE_FENCE } from "@shared/editor/rules/database";
import { client } from "~/utils/ApiClient";

/** A database block found in a document. */
export type FoundDatabase = DatabaseData & { id: string };

type LoadedDocument = {
  title: string;
  url: string;
  databases: Map<string, FoundDatabase>;
  loadedAt: number;
};

export type LinkStatus = "ready" | "loading" | "error";

/** Databases of documents, shared by all database blocks on the page. */
const cache = new Map<
  string,
  { loaded?: LoadedDocument; failed?: boolean; loading?: boolean }
>();
const listeners = new Set<() => void>();
const maxAge = 30 * 1000;

/**
 * Databases written in markdown as fenced JSON blocks.
 *
 * @param text markdown of a document.
 * @returns the databases by block id.
 */
export function databasesInMarkdown(text: string): Map<string, FoundDatabase> {
  const result = new Map<string, FoundDatabase>();
  const fence = new RegExp(
    "^(`{3,})" + DATABASE_FENCE + "\\n([\\s\\S]*?)\\n\\1$",
    "gm"
  );
  for (const match of text.matchAll(fence)) {
    try {
      const raw = JSON.parse(match[2]);
      if (typeof raw?.id === "string") {
        result.set(raw.id, { id: raw.id, ...normalizeDatabase(raw) });
      }
    } catch {
      // A broken block is skipped.
    }
  }
  return result;
}

/** Databases of an editor document, by block id. */
export function databasesInDoc(
  doc: ProsemirrorNode
): Map<string, FoundDatabase> {
  const result = new Map<string, FoundDatabase>();
  doc.descendants((node) => {
    if (node.type.name === "database") {
      result.set(node.attrs.id, {
        id: node.attrs.id,
        ...databaseFromNode(node),
      });
      return false;
    }
    return true;
  });
  return result;
}

function findNode(doc: ProsemirrorNode, databaseId: string) {
  let found: ProsemirrorNode | undefined;
  doc.descendants((node) => {
    if (found) {
      return false;
    }
    if (node.type.name === "database" && node.attrs.id === databaseId) {
      found = node;
    }
    return node.type.name !== "database";
  });
  return found;
}

/**
 * Loads the databases of a document through the API.
 *
 * @param documentId the document.
 * @param force reload even if the cached copy is recent.
 */
export function loadDocument(documentId: string, force = false) {
  const entry = cache.get(documentId) ?? {};
  cache.set(documentId, entry);
  if (
    entry.loading ||
    (!force && entry.loaded && Date.now() - entry.loaded.loadedAt < maxAge)
  ) {
    return;
  }
  entry.loading = true;
  client
    .post("/documents.info", { id: documentId })
    .then((res) => {
      entry.loaded = {
        title: res.data.title,
        url: res.data.url,
        databases: databasesInMarkdown(res.data.text ?? ""),
        loadedAt: Date.now(),
      };
      entry.failed = false;
    })
    .catch(() => {
      // No access or deleted: relations show nothing instead of failing.
      entry.failed = true;
    })
    .finally(() => {
      entry.loading = false;
      listeners.forEach((listener) => listener());
    });
}

export type LinkedDatabases = {
  /** Data of a linked database, undefined while loading or unavailable. */
  get: (ref: DatabaseRef) => DatabaseData | undefined;
  status: (documentId: string) => LinkStatus;
  /** Title, url and databases of a loaded document. */
  document: (documentId: string) => LoadedDocument | undefined;
};

/**
 * Data of the databases that relations of a block link to. Databases of the
 * same document are read from the editor; others are loaded through the API
 * and refreshed when the window gets focus.
 *
 * @param refs linked databases.
 * @param view the editor.
 * @param documentId the current document.
 */
export function useLinkedDatabases(
  refs: DatabaseRef[],
  view: EditorView,
  documentId: string | undefined
): LinkedDatabases {
  const [, setVersion] = React.useState(0);
  const external = [
    ...new Set(
      refs.map((ref) => ref.documentId).filter((id) => id !== documentId)
    ),
  ];
  const local = refs.filter((ref) => ref.documentId === documentId);
  const externalKey = external.join(",");
  const localKey = local.map((ref) => ref.databaseId).join(",");

  React.useEffect(() => {
    const listener = () => setVersion((v) => v + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  React.useEffect(() => {
    if (!externalKey) {
      return;
    }
    const ids = externalKey.split(",");
    ids.forEach((id) => loadDocument(id));
    const refresh = () => ids.forEach((id) => loadDocument(id, true));
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [externalKey]);

  // Other blocks of this document do not re-render this one when they
  // change, so their nodes are checked for changes now and then.
  React.useEffect(() => {
    if (!localKey) {
      return;
    }
    const ids = localKey.split(",");
    let last = ids.map((id) => findNode(view.state.doc, id));
    const timer = window.setInterval(() => {
      const next = ids.map((id) => findNode(view.state.doc, id));
      if (next.some((node, i) => node !== last[i])) {
        last = next;
        setVersion((v) => v + 1);
      }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [localKey, view]);

  return {
    get: (ref) => {
      if (ref.documentId === documentId) {
        const node = findNode(view.state.doc, ref.databaseId);
        return node ? databaseFromNode(node) : undefined;
      }
      return cache.get(ref.documentId)?.loaded?.databases.get(ref.databaseId);
    },
    status: (id) => {
      if (id === documentId) {
        return "ready";
      }
      const entry = cache.get(id);
      return entry?.loaded ? "ready" : entry?.failed ? "error" : "loading";
    },
    document: (id) => cache.get(id)?.loaded,
  };
}
