import { useState, useMemo, useEffect } from "react";
import type { SerializedNode, Project, LocalizationKey } from "./types";
import { SettingsDialog } from "./SettingsDialog";

interface Props {
  linked: boolean;
  projectSlug: string | null;
  projects: Project[];
  keys: LocalizationKey[];
  language: string | null;
  selectionType: "none" | "text" | "frame" | "multi";
  selectionNode: SerializedNode | null;
  selectionTextNodes: SerializedNode[];
  userEmail: string | null;
  onSetLanguage: (lang: string) => void;
  onAssignNodeKey: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (keyId: string, lang: string, value: string) => Promise<void>;
  onApplyTranslations: (nodes: SerializedNode[], lang: string | null) => void;
  onRevertTranslations: (nodes: SerializedNode[]) => void;
  onSaveFileLink: (slug: string) => Promise<void>;
  onUnlinkFile: () => Promise<void>;
  onLogout: () => void;
}

export function MainScreen({
  linked,
  projectSlug,
  projects,
  keys,
  language,
  selectionType,
  selectionNode,
  selectionTextNodes,
  userEmail,
  onSetLanguage,
  onAssignNodeKey,
  onUpdateKeyValue,
  onApplyTranslations,
  onRevertTranslations,
  onSaveFileLink,
  onUnlinkFile,
  onLogout,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  const project = useMemo(
    () => projects.find((p) => p.slug === projectSlug),
    [projects, projectSlug],
  );

  const languages = useMemo(() => {
    if (!project) return [];
    return [project.defaultLanguage, ...project.otherLanguages];
  }, [project]);

  const effectiveLanguage = language || project?.defaultLanguage || null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Header Container */}
      <div className="header" style={{ display: "block", padding: 0 }}>
        {/* User Auth Row */}
        <div
          style={{
            display: "none", // Hidden for now
            alignItems: "center",
            padding: "10px 12px",
            gap: "8px",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#888",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            Signed in as {userEmail || "…"}
          </span>
          <button className="btn-secondary btn-sm" onClick={onLogout}>
            Sign out
          </button>
        </div>

        {/* Linked project details */}
        {linked && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "8px",
              gap: "8px",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "#888",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Project: {project?.name || "Loading…"}
              </span>
              <a
                style={{
                  cursor: "pointer",
                  color: "#18a0fb",
                  fontSize: 11,
                  textDecoration: "none",
                }}
                onClick={() => setSettingsOpen(true)}
              >
                Change
              </a>
            </div>
            <div
              style={{ display: "flex", alignItems: "center", width: "100%" }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "#888",
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Language
              </span>
              <select
                value={effectiveLanguage || ""}
                onChange={(e) => onSetLanguage(e.target.value)}
                style={{
                  padding: "4px",
                  fontSize: 11,
                  border: "1px solid #d0d0d0",
                  borderRadius: 4,
                  backgroundColor: "#fff",
                  outline: "none",
                }}
              >
                {languages.map((code) => {
                  let label = code;
                  try {
                    const dn = new Intl.DisplayNames(["en"], {
                      type: "language",
                    });
                    label = dn.of(code) || code;
                  } catch {
                    // ignore
                  }
                  return (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Not-linked banner */}
      {!linked && (
        <div className="banner">
          ⚠ File not linked to a project.{" "}
          <a onClick={() => setSettingsOpen(true)}>Link now</a>
        </div>
      )}

      {/* Body */}
      <div className="body">
        {selectionType === "none" && (
          <div className="center" style={{ padding: "40px 16px" }}>
            <p className="muted">Select a frame or text node to get started.</p>
          </div>
        )}

        {selectionType === "instance" && (
          <div className="center" style={{ padding: "40px 16px" }}>
            <p style={{ color: "#d9534f" }}>Component instances are not supported. Please select the Main Component instead.</p>
          </div>
        )}

        {selectionType !== "none" && selectionType !== "instance" && (
          <TextNodesTable
            nodes={selectionType === "text" && selectionNode ? [selectionNode] : selectionTextNodes}
            keys={keys}
            linked={linked}
            language={effectiveLanguage}
            onAssign={onAssignNodeKey}
            onUpdateKeyValue={onUpdateKeyValue}
            onApplyAll={onApplyTranslations}
            onRevertAll={onRevertTranslations}
          />
        )}
      </div>

      {/* Settings dialog */}
      {settingsOpen && (
        <SettingsDialog
          projects={projects}
          currentSlug={projectSlug}
          linked={linked}
          onSave={async (slug) => {
            await onSaveFileLink(slug);
            setSettingsOpen(false);
          }}
          onUnlink={async () => {
            await onUnlinkFile();
            setSettingsOpen(false);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

// ── Text Nodes Table ─────────────────────────────────────────────────────────

function TextNodesTable({
  nodes,
  keys,
  linked,
  language,
  onAssign,
  onUpdateKeyValue,
  onApplyAll,
  onRevertAll,
}: {
  nodes: SerializedNode[];
  keys: LocalizationKey[];
  linked: boolean;
  language: string | null;
  onAssign: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (keyId: string, lang: string, value: string) => Promise<void>;
  onApplyAll: (nodes: SerializedNode[], lang: string | null) => void;
  onRevertAll: (nodes: SerializedNode[]) => void;
}) {
  return (
    <div className="card">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "8px",
          padding: "8px 12px",
          borderBottom: "1px solid #e8e8e8",
          background: "#f9f9f9",
          fontSize: 11,
          fontWeight: 600,
          color: "#555",
        }}
      >
        <div>Key</div>
        <div>
          <span>Shared value</span>
          <span
            onClick={() => onApplyAll(nodes, language)}
            style={{ fontWeight: 400, color: "#18a0fb", cursor: "pointer", paddingLeft: "8px" }}
          >
            Apply all
          </span>
        </div>
        <div>
          <span>Current value</span>
          <span
            onClick={() => onRevertAll(nodes)}
            style={{ fontWeight: 400, color: "#18a0fb", cursor: "pointer", paddingLeft: "8px" }}
          >
            Revert all
          </span>
        </div>
      </div>
      {nodes.length === 0 ? (
        <div
          style={{
            padding: 12,
            textAlign: "center",
            color: "#999",
            fontSize: 11,
          }}
        >
          No text nodes found within selection.
        </div>
      ) : (
        nodes.map((node) => (
          <NodeRow
            key={node.id}
            node={node}
            keys={keys}
            linked={linked}
            language={language}
            onAssign={onAssign}
            onUpdateKeyValue={onUpdateKeyValue}
          />
        ))
      )}
    </div>
  );
}

function NodeRow({
  node,
  keys,
  linked,
  language,
  onAssign,
  onUpdateKeyValue,
}: {
  node: SerializedNode;
  keys: LocalizationKey[];
  linked: boolean;
  language: string | null;
  onAssign: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (keyId: string, lang: string, value: string) => Promise<void>;
}) {
  const keyObj = keys.find((k) => k.key === node.keySlug);
  
  // Try exact match first, then prefix match (e.g. "en" matches "en-gb") if language code is short.
  const shareValue = useMemo(() => {
    if (!keyObj || !language || !keyObj.values) return null;
    if (keyObj.values[language]) return keyObj.values[language];
    
    // Fallback search for approximate match
    const keysInValues = Object.keys(keyObj.values);
    const approximateMatch = keysInValues.find(k => k.startsWith(language + "-") || language.startsWith(k + "-"));
    return approximateMatch ? keyObj.values[approximateMatch] : null;
  }, [keyObj, language]);

  const [localValue, setLocalValue] = useState(shareValue || "");

  useEffect(() => {
    setLocalValue(shareValue || "");
  }, [shareValue]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "8px",
        padding: "10px 12px",
        borderBottom: "1px solid #f0f0f0",
        alignItems: "flex-start",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <KeySelect
          keys={keys}
          currentSlug={node.keySlug || null}
          disabled={!linked || keys.length === 0}
          onChange={(slug) => onAssign(node.id, slug)}
        />
      </div>

      <div style={{ minWidth: 0 }}>
        {keyObj ? (
          <input
            style={{
              width: "100%",
              fontSize: 11,
              color: "#333",
              background: "#fff",
              border: "1px solid #d0d0d0",
              padding: "4px 6px",
              borderRadius: 4,
              boxSizing: "border-box",
              outline: "none"
            }}
            value={localValue}
            placeholder={language ? `Value for ${language}...` : "Select language..."}
            onChange={(e) => setLocalValue(e.target.value)}
            onBlur={() => {
              if (language && localValue !== (shareValue || "")) {
                onUpdateKeyValue(keyObj._id, language, localValue);
              }
            }}
          />
        ) : (
          <div
            style={{
              fontSize: 11,
              color: "#aaa",
              fontStyle: "italic",
              background: "#f0f0f0",
              padding: "4px 6px",
              borderRadius: 4,
              minHeight: "22px",
            }}
          >
            (no key assigned)
          </div>
        )}
      </div>

      <div
        style={{
          fontSize: 11,
          color: "#333",
          wordBreak: "break-word",
          overflowWrap: "anywhere",
          paddingTop: 4,
        }}
      >
        {node.characters || ""}
      </div>
    </div>
  );
}

// ── Shared key select ──────────────────────────────────────────────────────

function KeySelect({
  keys,
  currentSlug,
  disabled,
  onChange,
}: {
  keys: LocalizationKey[];
  currentSlug: string | null;
  disabled: boolean;
  onChange: (slug: string | null) => void;
}) {
  const found = keys.some((k) => k.key === currentSlug);

  return (
    <select
      style={{ fontSize: 11, padding: "3px 6px" }}
      disabled={disabled}
      value={currentSlug || ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">— Unassigned —</option>
      {keys.map((k) => (
        <option key={k.key} value={k.key}>
          {k.key}
        </option>
      ))}
      {currentSlug && !found && (
        <option value={currentSlug}>{currentSlug} (not found)</option>
      )}
    </select>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getBadgeInfo(slug: string | null, keys: LocalizationKey[]) {
  if (!slug) return { className: "badge-unassigned", label: "—" };
  const exists = keys.some((k) => k.key === slug);
  if (exists) return { className: "badge-assigned", label: "✓" };
  return { className: "badge-unresolved", label: "!" };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
