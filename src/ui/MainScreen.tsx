import * as React from "react";
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import type {
  SerializedNode,
  Project,
  LocalizationKey,
  Language,
  SelectionType,
} from "./types";
import { SettingsDialog } from "./SettingsDialog";

interface Props {
  linked: boolean;
  projectSlug: string | null;
  projects: Project[];
  allLanguages: Language[];
  keys: LocalizationKey[];
  language: string | null;
  selectionType: SelectionType;
  selectionNode: SerializedNode | null;
  selectionTextNodes: SerializedNode[];
  userEmail: string | null;
  onSetLanguage: (lang: string) => void;
  onAssignNodeKey: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (
    keyId: string,
    lang: string,
    value: string,
  ) => Promise<void>;
  onApplyTranslations: (nodes: SerializedNode[], lang: string | null) => void;
  onRevertTranslations: (nodes: SerializedNode[]) => void;
  onSaveFileLink: (slug: string) => Promise<void>;
  onUnlinkFile: () => Promise<void>;
  onLogout: () => void;
  onCreateKey: (key: string) => Promise<LocalizationKey | null>;
  onSync: (allKeys: LocalizationKey[]) => Promise<void>;
  onNotify: (
    message: string,
    options?: { error?: boolean; timeout?: number },
  ) => void;
}

export function MainScreen({
  linked,
  projectSlug,
  projects,
  allLanguages,
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
  onCreateKey,
  onSync,
  onNotify,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync(keys);
      onNotify("Successfully synced to Lokalit!");
    } catch {
      onNotify("Failed to sync. Please try again.", { error: true });
    } finally {
      setSyncing(false);
    }
  };

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
        height: "100%", // Fill the plugin height
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
                  const langObj = allLanguages.find((l) => l.key === code);
                  const label = langObj ? langObj.name : code;
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
      <div
        className="body"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {selectionType === "none" && (
          <div className="center" style={{ padding: "40px 16px" }}>
            <p className="muted">Select a frame or text node to get started.</p>
          </div>
        )}

        {selectionType === "instance" && (
          <div className="center" style={{ padding: "40px 16px" }}>
            <p style={{ color: "#d9534f" }}>
              Component instances are not supported. Please select the Main
              Component instead.
            </p>
          </div>
        )}

        {selectionType !== "none" && selectionType !== "instance" && (
          <TextNodesTable
            nodes={
              selectionType === "text" && selectionNode
                ? [selectionNode]
                : selectionTextNodes
            }
            keys={keys}
            linked={linked}
            language={effectiveLanguage}
            onAssign={onAssignNodeKey}
            onUpdateKeyValue={onUpdateKeyValue}
            onApplyAll={onApplyTranslations}
            onRevertAll={onRevertTranslations}
            onCreateKey={onCreateKey}
          />
        )}
      </div>

      {/* Main Footer (Sync) */}
      <div
        style={{
          padding: "16px",
          borderTop: "1px solid #e5e5e5",
          background: "#fff",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            width: "max-content",
            padding: "8px 12px",
            background: syncing ? "#ccc" : "#007a55",
            color: "#fff",
            border: "none",
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 600,
            cursor: syncing ? "default" : "pointer",
            transition: "background 0.2s",
          }}
        >
          {syncing ? "Syncing to Lokalit..." : "Sync to Lokalit"}
        </button>
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
  onCreateKey,
}: {
  nodes: SerializedNode[];
  keys: LocalizationKey[];
  linked: boolean;
  language: string | null;
  onAssign: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (
    keyId: string,
    lang: string,
    value: string,
  ) => Promise<void>;
  onApplyAll: (nodes: SerializedNode[], lang: string | null) => void;
  onRevertAll: (nodes: SerializedNode[]) => void;
  onCreateKey: (key: string) => Promise<LocalizationKey | null>;
}) {
  return (
    <div
      className="card"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden", // Restore overflow hidden
      }}
    >
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
          position: "sticky",
          top: 0,
          zIndex: 100, // Header should be above rows
        }}
      >
        <div>Key</div>
        <div>
          <span>Shared value</span>
          <span
            onClick={() => onApplyAll(nodes, language)}
            style={{
              fontWeight: 400,
              color: "#18a0fb",
              cursor: "pointer",
              paddingLeft: "8px",
            }}
          >
            Apply all
          </span>
        </div>
        <div>
          <span>Current value</span>
          <span
            onClick={() => onRevertAll(nodes)}
            style={{
              fontWeight: 400,
              color: "#18a0fb",
              cursor: "pointer",
              paddingLeft: "8px",
            }}
          >
            Revert all
          </span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
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
          nodes.map((node, index) => (
            <NodeRow
              key={node.id}
              node={node}
              keys={keys}
              linked={linked}
              language={language}
              onAssign={onAssign}
              onUpdateKeyValue={onUpdateKeyValue}
              onCreateKey={onCreateKey}
              zIndex={nodes.length - index} // Higher rows have higher z-index
            />
          ))
        )}
      </div>
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
  onCreateKey,
  zIndex,
}: {
  node: SerializedNode;
  keys: LocalizationKey[];
  linked: boolean;
  language: string | null;
  onAssign: (nodeId: string, keySlug: string | null) => void;
  onUpdateKeyValue: (
    keyId: string,
    lang: string,
    value: string,
  ) => Promise<void>;
  onCreateKey: (key: string) => Promise<LocalizationKey | null>;
  zIndex: number;
}) {
  const keyObj = keys.find((k) => k.key === node.keySlug);

  const shareValue = useMemo(() => {
    if (!keyObj || !language || !keyObj.values) return null;
    return keyObj.values[language] || null;
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
        position: "relative",
        zIndex: zIndex, // Ensure this row is above subsequent rows
      }}
    >
      <div style={{ minWidth: 0 }}>
        <KeySelect
          keys={keys}
          currentSlug={node.keySlug || null}
          disabled={!linked}
          onChange={(slug) => onAssign(node.id, slug)}
          onCreateKey={onCreateKey}
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
              outline: "none",
            }}
            value={localValue}
            placeholder={
              language ? `Value for ${language}...` : "Select language..."
            }
            onChange={(e: any) => setLocalValue(e.target.value)}
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
  onCreateKey,
}: {
  keys: LocalizationKey[];
  currentSlug: string | null;
  disabled: boolean;
  onChange: (slug: string | null) => void;
  onCreateKey: (key: string) => Promise<LocalizationKey | null>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setSearch(currentSlug || "");
  }, [currentSlug]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const isInsideInput =
        containerRef.current && containerRef.current.contains(e.target as Node);
      const isInsideDropdown =
        dropdownRef.current && dropdownRef.current.contains(e.target as Node);

      if (!isInsideInput && !isInsideDropdown) {
        setIsOpen(false);
        setSearch(currentSlug || "");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentSlug]);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      setRect(containerRef.current.getBoundingClientRect());
    }
  }, [isOpen]);

  const filteredKeys = useMemo(() => {
    if (!search || search === currentSlug) return keys;
    return keys.filter((k) =>
      k.key.toLowerCase().includes(search.toLowerCase()),
    );
  }, [keys, search, currentSlug]);

  const exactMatch = keys.find(
    (k) => k.key.toLowerCase() === search.toLowerCase(),
  );

  const handleCreate = async () => {
    if (!search.trim()) return;
    const newKey = await onCreateKey(search.trim());
    if (newKey) {
      onChange(newKey.key);
      setIsOpen(false);
    }
  };

  const dropdownContent = isOpen && !disabled && rect && (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: rect.bottom + 2,
        left: rect.left,
        width: rect.width,
        zIndex: 2000,
        background: "#fff",
        border: "1px solid #d0d0d0",
        borderRadius: 4,
        height: 150,
        overflowY: "auto",
        boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
      }}
    >
      <div
        onClick={() => {
          onChange(null);
          setIsOpen(false);
          setSearch("");
        }}
        style={{
          padding: "4px 8px",
          fontSize: 11,
          cursor: "pointer",
          background: !search ? "#f0f0f0" : "transparent",
        }}
      >
        — Unassigned —
      </div>
      {filteredKeys.map((k) => (
        <div
          key={k._id}
          onClick={() => {
            onChange(k.key);
            setIsOpen(false);
          }}
          style={{
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
            background: k.key === currentSlug ? "#e8f4ff" : "transparent",
          }}
        >
          {k.key}
        </div>
      ))}
      {!exactMatch && search.trim() && (
        <div
          onClick={handleCreate}
          style={{
            padding: "4px 8px",
            fontSize: 11,
            cursor: "pointer",
            color: "#18a0fb",
            borderTop: "1px solid #eee",
            fontWeight: 600,
          }}
        >
          + Create "{search.trim()}"
        </div>
      )}
    </div>
  );

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        disabled={disabled}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder="Search or create key..."
        style={{
          width: "100%",
          fontSize: 11,
          padding: "4px 6px",
          border: "1px solid #d0d0d0",
          borderRadius: 4,
          boxSizing: "border-box",
          outline: "none",
        }}
      />
      {dropdownContent ? createPortal(dropdownContent, document.body) : null}
    </div>
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
