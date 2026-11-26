import { Channel, invoke } from "@tauri-apps/api/core";
import {
  AssistantError,
  errorFromServer,
  errorMessage,
  type AssistantReply,
  type SendTurn,
  type ToolCall,
} from "@scholarkit/assistant";
import { isDesktop } from "@scholarkit/editor/lib/platform";
import type { AssistantSettings } from "./providers";
import { t } from "@scholarkit/i18n";

/**
 * Talking to the model. A turn goes to our model through the account's
 * server (Plus and Pro), or to the provider set up in Settings. The
 * desktop app asks from Rust, which keeps the account's token and the
 * provider's key; the browser asks our server with its session, or a
 * model on this computer directly.
 */

/** A message of the background reader, which calls no tools. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Asks the model once and gives its answer. Rejects when `signal` aborts. */
export type Complete = (
  messages: ChatMessage[],
  signal: AbortSignal,
) => Promise<string>;

const aborted = () => new DOMException(t("The assistant was stopped."), "AbortError");

/** Errors from Rust come as strings. */
const textOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

let nextRequest = 1;

/** The assistant message of a provider that speaks the OpenAI chat API, from its JSON. */
export function replyOf(body: unknown): AssistantReply {
  const message = (
    body as {
      choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
    }
  )?.choices?.[0]?.message;
  const calls = Array.isArray(message?.tool_calls)
    ? (message.tool_calls as ToolCall[])
    : [];
  const content = message?.content;
  let text: string;
  if (typeof content === "string") text = content;
  // Some providers send the content in parts.
  else if (Array.isArray(content))
    text = content
      .map((part: { text?: unknown }) =>
        typeof part?.text === "string" ? part.text : "",
      )
      .join("");
  else if (calls.length || content === null) text = "";
  else
    throw new Error(
      t("The model gave an answer Binder can't read. Check the address and the model."),
    );
  return calls.length
    ? { role: "assistant", content: text, tool_calls: calls }
    : { role: "assistant", content: text };
}

/** The answer of a provider that speaks the OpenAI chat API, from its JSON. */
export const answerOf = (body: unknown): string => replyOf(body).content;

/** Runs a desktop command that `assistant_cancel` stops when `signal` aborts. */
async function cancellable<T>(
  signal: AbortSignal | undefined,
  run: (requestId: number) => Promise<T>,
): Promise<T> {
  if (signal?.aborted) throw aborted();
  const requestId = nextRequest++;
  const stop = () => void invoke("assistant_cancel", { requestId }).catch(() => {});
  signal?.addEventListener("abort", stop);
  try {
    return await run(requestId);
  } catch (error) {
    if (signal?.aborted) throw aborted();
    throw error;
  } finally {
    signal?.removeEventListener("abort", stop);
  }
}

/** One turn at the provider these settings name: an own key or a model on this computer. */
export function ownTurn(settings: AssistantSettings): SendTurn {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  const model = settings.model.trim();
  // The provider's own words, for the panel to show as they are.
  const failed = (message: string) => new AssistantError("provider", message);
  if (isDesktop) {
    return (messages, tools, onText, signal) =>
      cancellable(signal, async (requestId) => {
        let reply: AssistantReply;
        try {
          reply = await invoke<AssistantReply>("assistant_chat", {
            args: {
              provider: settings.provider,
              baseUrl,
              model,
              messages,
              tools,
              requestId,
            },
          });
        } catch (error) {
          if (signal?.aborted) throw error;
          throw failed(textOf(error));
        }
        if (reply.content) onText(reply.content);
        return reply;
      });
  }
  return async (messages, tools, onText, signal) => {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          ...(tools.length ? { tools } : {}),
        }),
        signal,
      });
    } catch {
      if (signal?.aborted) throw aborted();
      throw failed(
        t(
          "The model at {baseUrl} didn't answer. Is it running, and does it accept requests from this page?",
          { baseUrl },
        ),
      );
    }
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = (body as { error?: { message?: string } | string })?.error;
      const message = typeof detail === "string" ? detail : detail?.message;
      throw failed(
        message
          ? t("The model answered {status}: {message}", {
              status: response.status,
              message,
            })
          : t("The model answered {status}.", { status: response.status }),
      );
    }
    let reply: AssistantReply;
    try {
      reply = replyOf(body);
    } catch (error) {
      throw failed(textOf(error));
    }
    if (reply.content) onText(reply.content);
    return reply;
  };
}

/**
 * One turn on our model from the desktop app: Rust sends it with the
 * account's token and streams the answer back. Its failures come as
 * "assistant:<code>:<message>", with the server's code.
 */
export const desktopTurn: SendTurn = (messages, tools, onText, signal) =>
  cancellable(signal, async (requestId) => {
    const onEvent = new Channel<{ kind: "text"; delta: string }>();
    onEvent.onmessage = (event) => {
      if (event.kind === "text") onText(event.delta);
    };
    try {
      return await invoke<AssistantReply>("assistant_turn", {
        args: { messages, tools, requestId },
        onEvent,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw assistantNotice(error);
    }
  });

/** The shell's "assistant:<code>:<message>" as the error the panel says. */
export function assistantNotice(error: unknown): unknown {
  const notice =
    typeof error === "string" ? /^assistant:([a-z_]+):(.*)$/s.exec(error) : null;
  return notice ? errorFromServer(notice[1], notice[2]) : error;
}

/**
 * The background reader's way to ask: one turn without tools. A failure
 * says what to do, as the panel would.
 */
export function completeWith(send: SendTurn): Complete {
  return async (messages, signal) => {
    try {
      const reply = await send(messages, [], () => {}, signal);
      return reply.content;
    } catch (error) {
      if (signal.aborted) throw aborted();
      throw new Error(errorMessage(error), { cause: error });
    }
  };
}

/** The models a provider offers. Also checks the connection and the key. */
export async function listModels(settings: AssistantSettings): Promise<string[]> {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  if (isDesktop) {
    return invoke<string[]>("assistant_models", {
      provider: settings.provider,
      baseUrl,
    }).catch((error: unknown) => {
      throw new Error(textOf(error));
    });
  }
  const response = await fetch(`${baseUrl}/models`);
  if (!response.ok)
    throw new Error(t("The model answered {status}.", { status: response.status }));
  const body = (await response.json()) as { data?: Array<{ id?: unknown }> };
  return [
    ...new Set(
      (body.data ?? []).map((model) => model.id).filter((id) => typeof id === "string"),
    ),
  ].sort() as string[];
}

/** Whether a key is kept for a provider. Desktop only. */
export const hasKey = (provider: string) =>
  isDesktop
    ? invoke<boolean>("assistant_key_exists", { provider }).catch(() => false)
    : Promise.resolve(false);

/** Keeps a provider's key in the system's credential store, or takes it out when empty. */
export const setKey = (provider: string, key: string) =>
  invoke<void>(key.trim() ? "assistant_key_set" : "assistant_key_delete", {
    provider,
    ...(key.trim() ? { key: key.trim() } : {}),
  }).catch((error: unknown) => {
    throw new Error(textOf(error));
  });
