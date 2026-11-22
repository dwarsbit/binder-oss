import { invoke } from "@tauri-apps/api/core";
import {
  EXPORT_FORMATS,
  type ExportFormat,
} from "@scholarkit/editor/references/export";
import { isDesktop } from "@scholarkit/editor/lib/platform";

/**
 * Saves an export as a file. The desktop app asks where, in the
 * system's save dialog; a browser downloads it. Gives false when the
 * save dialog was cancelled.
 */
export async function saveExport(
  name: string,
  format: ExportFormat,
  text: string,
): Promise<boolean> {
  const entry = EXPORT_FORMATS.find((candidate) => candidate.id === format);
  if (!entry) return false;
  if (isDesktop) {
    return invoke<boolean>("export_save", {
      name,
      format: entry.label,
      extension: entry.extension,
      text,
    }).catch((error: unknown) => {
      throw new Error(typeof error === "string" ? error : String(error));
    });
  }
  const url = URL.createObjectURL(new Blob([text], { type: entry.mediaType }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
