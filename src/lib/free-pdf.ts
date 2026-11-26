/** How many of Unpaywall's links Binder tries before it gives up. */
export const PDF_TRIES = 3;

/**
 * The first of these links, best first, that gives a PDF, as `fetch`
 * finds it: the address it ends at after redirects. Null when none of
 * the first few does: a publisher can block downloads, or answer with a
 * web page in place of the PDF.
 */
export async function firstPdf(
  links: readonly string[],
  fetch: (url: string) => Promise<{ kind: string; url?: string } | null>,
): Promise<string | null> {
  for (const link of links.slice(0, PDF_TRIES)) {
    const found = await fetch(link).catch(() => null);
    if (found?.kind === "pdf" && found.url) return found.url;
  }
  return null;
}
