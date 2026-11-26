import { invoke } from "@tauri-apps/api/core";
import type { OpenAccessResponse } from "@scholarkit/contracts";
import {
  AccountServer,
  ServerError,
  type Answer,
  type Transport,
} from "@scholarkit/editor/lib/account";
import { toBase64 } from "@scholarkit/editor/lib/project-doc";
import { t } from "@scholarkit/i18n";
import type { OpenAlexKeyStore } from "./store";

export {
  browserTransport,
  ServerError,
  type Account,
  type ServerProject,
} from "@scholarkit/editor/lib/account";

/** The bytes behind a web address, as the server fetched them. */
export interface WebFile {
  /** The address after redirects. */
  url: string;
  /** The media type the site gave, without its parameters. */
  contentType: string;
  bytes: ArrayBuffer;
}

/**
 * The server as the desktop app reaches it: through the app, which adds
 * the account's token. The window never sees the token.
 */
export const desktopTransport: Transport = async (method, path, body) => {
  try {
    return await invoke<Answer>("server_request", {
      method,
      path,
      json: body && "json" in body ? JSON.stringify(body.json) : null,
      bytes: body && "bytes" in body ? toBase64(body.bytes) : null,
    });
  } catch (error) {
    throw new ServerError(
      0,
      "offline",
      typeof error === "string" ? error : String(error),
    );
  }
};

/**
 * The Scholarkit server: the account and its binders (projects of the
 * app "binder"), in the browser and in the desktop app. In the browser,
 * also the links it fetches for the binder, since a page there can't
 * read another site.
 */
export class BinderServer extends AccountServer {
  constructor(send: Transport) {
    super(send, "binder", t("Sign in to your Scholarkit account first."));
  }

  /**
   * Links to free PDFs of the work with this DOI, best first. The server
   * asks Unpaywall; the app never does. Empty when there is none.
   */
  async openAccessPdfs(doi: string): Promise<string[]> {
    try {
      const answer = await this.call<OpenAccessResponse>(
        "GET",
        `/api/lookup/open-access?doi=${encodeURIComponent(doi)}`,
      );
      return answer.pdfs;
    } catch (error) {
      if (error instanceof ServerError && error.status === 404) return [];
      throw error;
    }
  }

  /** Fetches a web address on the server. Same origin only, signed in by the session cookie. */
  async fetchWeb(url: string): Promise<WebFile> {
    let response: Response;
    try {
      response = await fetch("/api/web/fetch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
    } catch {
      throw new ServerError(
        0,
        "offline",
        t("The server can't be reached. Check your connection."),
      );
    }
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        error?: string;
        message?: string;
      } | null;
      throw new ServerError(
        response.status,
        error?.error ?? "error",
        error?.message ||
          t("The server answered {status}.", { status: response.status }),
      );
    }
    return {
      url: response.headers.get("x-fetched-url") ?? url,
      contentType: (response.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase(),
      bytes: await response.arrayBuffer(),
    };
  }
}

/** The OpenAlex key kept with the account, as the store hands it to Binder. */
export const openAlexKeyOf = (server: BinderServer): OpenAlexKeyStore => ({
  get: () => server.openAlexKey(),
  save: (key) => server.saveOpenAlexKey(key),
  forget: () => server.forgetOpenAlexKey(),
});
