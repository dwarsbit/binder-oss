import { Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Face } from "@scholarkit/collab";
import { HEADER_BUTTON } from "@scholarkit/editor/components/Dialog";
import type { People as Members, ServerProject } from "@scholarkit/editor/lib/account";
import type { BinderServer } from "@/lib/server";
import { t } from "@scholarkit/i18n";

/**
 * Who is in a binder of the account besides you, read when it opens and again on `reload`,
 * as after the Share dialog closes. Empty while unknown, or for a binder only on this computer.
 */
export function useOthers(
  server: BinderServer,
  project: ServerProject | null,
  me: string | null,
): { others: Array<{ id: string; name: string }>; reload: () => void } {
  const [members, setMembers] = useState<Members | null>(null);
  const [asked, setAsked] = useState(0);
  const id = project?.id ?? null;
  useEffect(() => {
    if (!id) return;
    let current = true;
    server.people(id).then(
      (found) => current && setMembers(found),
      () => {},
    );
    return () => {
      current = false;
    };
  }, [server, id, asked]);
  const reload = useCallback(() => setAsked((n) => n + 1), []);
  if (!project || !members) return { others: [], reload };
  const everyone = [
    { id: project.owner.id, name: project.owner.name },
    ...members.members.map((member) => ({ id: member.userId, name: member.name })),
  ];
  return { others: everyone.filter((person) => person.id !== me), reload };
}

/** How many faces show before "+N". */
const SHOWN = 4;

/**
 * The others in a shared binder, one face each, and Share, in the header. Binder shows who
 * is in the binder, not who has it open: it has no live presence.
 */
export function People({
  people,
  onShare,
}: {
  /** Everyone in the binder but you. */
  people: Array<{ id: string; name: string }>;
  onShare: () => void;
}) {
  const shown = people.slice(0, SHOWN);
  const rest = people.length - shown.length;
  return (
    <>
      {people.length > 0 && (
        <button
          type="button"
          className="collab-faces rounded-full"
          title={people.map((person) => person.name).join("\n")}
          aria-label={t("Shared with {names}", {
            names: people.map((person) => person.name).join(", "),
          })}
          onClick={onShare}
        >
          {shown.map((person) => (
            <span key={person.id} className="collab-face-button">
              <Face person={person} size={24} />
            </span>
          ))}
          {rest > 0 && (
            <span className="collab-face-button">
              <span
                className="collab-face collab-face-more"
                style={{ width: 24, height: 24 }}
              >
                +{rest}
              </span>
            </span>
          )}
        </button>
      )}
      <button type="button" className={HEADER_BUTTON} onClick={onShare}>
        <Users className="size-3.5" aria-hidden />
        {t("Share")}
      </button>
    </>
  );
}
