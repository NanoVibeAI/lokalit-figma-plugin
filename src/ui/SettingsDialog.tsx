import { useState } from "react";
import type { Project } from "./types";

interface Props {
  projects: Project[];
  currentSlug: string | null;
  linked: boolean;
  onSave: (slug: string) => Promise<void>;
  onUnlink: () => Promise<void>;
  onClose: () => void;
}

export function SettingsDialog({ projects, currentSlug, linked, onSave, onUnlink, onClose }: Props) {
  const [selectedSlug, setSelectedSlug] = useState(currentSlug || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!selectedSlug) {
      setError("Please select a project.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(selectedSlug);
    } catch (e) {
      console.error("[Lokalit] Save file link failed:", e);
      setError(e instanceof Error ? e.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    setSaving(true);
    setError(null);
    try {
      await onUnlink();
    } catch (e) {
      console.error("[Lokalit] Unlink file failed:", e);
      setError("Failed to unlink. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <div className="dialog">
        <div className="row">
          <h2>File Settings</h2>
          <div className="fill" />
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        <div>
          <label>Linked project</label>
          <select value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
            {!linked && <option value="">— Select a project —</option>}
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="row" style={{ gap: 8, marginTop: 4 }}>
          {linked && (
            <button className="btn-danger btn-sm" disabled={saving} onClick={handleUnlink}>
              Unlink file
            </button>
          )}
          <div className="fill" />
          <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
          <button className="btn-primary btn-sm" disabled={saving} onClick={handleSave}>
            Save
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
