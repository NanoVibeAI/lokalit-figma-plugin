import { useMemo } from "react";
import type {
  Language,
  Project,
  SelectionType,
  SerializedNode,
} from "./types";

interface Props {
  linked: boolean;
  project: Project | null;
  allLanguages: Language[];
  currentLanguage: string | null;
  selectionType: SelectionType;
  selectionNode: SerializedNode | null;
  selectionTextNodes: SerializedNode[];
  applying: boolean;
  onSelectLanguage: (lang: string) => void;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function SetLanguageScreen({
  linked,
  project,
  allLanguages,
  currentLanguage,
  selectionType,
  selectionNode,
  selectionTextNodes,
  applying,
  onSelectLanguage,
  onConfirm,
  onCancel,
}: Props) {
  const projectLanguages = useMemo(() => {
    if (!project) return [];
    return [project.default_language, ...project.other_languages];
  }, [project]);

  const eligibleNodes = useMemo(() => {
    const nodes = selectionType === "text" && selectionNode
      ? [selectionNode]
      : selectionTextNodes;
    return nodes.filter((node) => !!node.keySlug);
  }, [selectionNode, selectionTextNodes, selectionType]);

  const hasWork = linked && !!project && projectLanguages.length > 0 && eligibleNodes.length > 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        padding: 16,
        gap: 12,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "#111" }}>Set Language</h2>
        <p className="muted">
          Update selected text layers using translation values from the linked project.
        </p>
      </div>

      {!linked || !project ? (
        <p className="error">This file is not linked to a project.</p>
      ) : null}

      {linked && project ? (
        <div className="card">
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: "#555", marginBottom: 4 }}>
                Project
              </div>
              <div>{project.name}</div>
            </div>

            <div>
              <label htmlFor="set-language-select">Language</label>
              <select
                id="set-language-select"
                value={currentLanguage || project.default_language}
                onChange={(e) => onSelectLanguage(e.target.value)}
                disabled={applying || projectLanguages.length === 0}
              >
                {projectLanguages.map((langKey) => {
                  const label = allLanguages.find((lang) => lang.key === langKey)?.name || langKey;
                  return (
                    <option key={langKey} value={langKey}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>

            {eligibleNodes.length === 0 ? (
              <p className="muted">
                Select one or more text nodes that already have a stored localization key.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: "auto" }}>
        <button className="btn-secondary" onClick={onCancel} disabled={applying}>
          Cancel
        </button>
        <button className="btn-primary" onClick={onConfirm} disabled={!hasWork || applying || !currentLanguage}>
          {applying ? "Applying..." : "Confirm"}
        </button>
      </div>
    </div>
  );
}