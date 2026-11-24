/**
 * Binder's addresses in the browser, under where the app is served ("/binder/"): the list of
 * binders at /binder/projects and one binder at /binder/projects/<id>.
 */
export function webAddresses(base: string) {
  /** The list of binders. */
  const list = `${base}projects`;

  /** One binder. */
  const of = (id: string) => `${list}/${encodeURIComponent(id)}`;

  /** The binder in an address, or null: on the list and anywhere else. */
  function idIn(path: string): string | null {
    if (!path.startsWith(`${list}/`)) return null;
    try {
      return (
        decodeURIComponent(path.slice(list.length + 1).split("/")[0] ?? "") || null
      );
    } catch {
      return null;
    }
  }

  /**
   * The address to show in place of this one, or null when it is right. An address from before
   * the move, /binder/<id>, becomes the binder's new one, so old links keep working. Anything
   * else that names no binder is the list.
   */
  function better(path: string): string | null {
    if (path === list || idIn(path) !== null) return null;
    const old = path.startsWith(base)
      ? path.slice(base.length).replace(/\/+$/, "")
      : "";
    return old !== "projects" && /^[A-Za-z0-9_-]+$/.test(old) ? of(old) : list;
  }

  return { list, of, idIn, better };
}
