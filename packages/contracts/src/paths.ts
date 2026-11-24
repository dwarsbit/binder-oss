// Project-relative paths, as the editor sends them to the API and the API to the compile
// service: "/"-separated, inside the project, nothing that a shell, latexmk or the file system
// could read as something else. Shared so both check the same rules.

const MAX_PATH_BYTES = 1024;
const MAX_SEGMENT_BYTES = 255;

/** Bytes in UTF-8; the web app has no Buffer. */
function utf8Length(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

/** What is wrong with a project path, or null when it is fine. */
export function projectPathProblem(path: string): string | null {
  if (path.length === 0 || utf8Length(path) > MAX_PATH_BYTES)
    return "path too long or empty";
  // eslint-disable-next-line no-control-regex -- rejects control characters on purpose
  if (/[\u0000-\u001f\u007f\\]/.test(path))
    return `unsupported character in ${JSON.stringify(path)}`;
  if (path.startsWith("/")) return `absolute path ${JSON.stringify(path)}`;
  for (const segment of path.split("/")) {
    if (segment === "" || segment === "." || segment === "..")
      return `invalid path ${JSON.stringify(path)}`;
    if (utf8Length(segment) > MAX_SEGMENT_BYTES)
      return `name too long in ${JSON.stringify(path)}`;
  }
  // latexmk writes its outputs there; the editor never sends it.
  if (path === "build" || path.startsWith("build/"))
    return `${JSON.stringify(path)} is the output folder`;
  return null;
}

/** Like projectPathProblem, for the main file: a .tex file that latexmk cannot read as an option. */
export function mainFileProblem(path: string): string | null {
  const problem = projectPathProblem(path);
  if (problem) return problem;
  if (!path.endsWith(".tex") || path.startsWith("-") || outputStem(path) === "") {
    return `unsupported main file ${JSON.stringify(path)}`;
  }
  return null;
}

/** The output name stem latexmk uses for a main file: "chapters/thesis.tex" -> "thesis". */
export function outputStem(main: string): string {
  return main.slice(main.lastIndexOf("/") + 1, -".tex".length);
}
