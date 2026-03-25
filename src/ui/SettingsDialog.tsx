import { useEffect, useMemo, useState } from "react";
import type { Language, Project } from "./types";

interface Props {
  projects: Project[];
  allLanguages: Language[];
  currentSlug: string | null;
  linked: boolean;
  onSave: (slug: string) => Promise<void>;
  onCreateProject: (input: {
    name: string;
    slug: string;
    defaultLanguage: string;
    otherLanguages: string[];
  }) => Promise<Project>;
  onCheckSlugAvailable: (slug: string) => Promise<boolean>;
  onUnlink: () => Promise<void>;
  onClose: () => void;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
}

export function SettingsDialog({ projects, allLanguages, currentSlug, linked, onSave, onCreateProject, onCheckSlugAvailable, onUnlink, onClose }: Props) {
  const [selectedSlug, setSelectedSlug] = useState(currentSlug || "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"link" | "create">("link");

  const [newName, setNewName] = useState("");
  const newSlug = useMemo(() => toSlug(newName), [newName]);
  const [defaultLanguage, setDefaultLanguage] = useState(allLanguages[0]?.key ?? "en");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  useEffect(() => {
    setDefaultLanguage((prev) => prev || allLanguages[0]?.key || "en");
  }, [allLanguages]);

  useEffect(() => {
    if (!newSlug) {
      setSlugAvailable(null);
      setSlugChecking(false);
      return;
    }

    let cancelled = false;
    setSlugChecking(true);
    setSlugAvailable(null);

    const timer = setTimeout(async () => {
      try {
        const available = await onCheckSlugAvailable(newSlug);
        if (!cancelled) setSlugAvailable(available);
      } catch {
        if (!cancelled) setSlugAvailable(false);
      } finally {
        if (!cancelled) setSlugChecking(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [newSlug, onCheckSlugAvailable]);

  const createError = useMemo(() => {
    if (!newName.trim()) return "Project name is required.";
    if (!newSlug) return "Slug must contain at least one letter or number.";
    if (!defaultLanguage) return "Default language is required.";
    if (otherLanguages.includes(defaultLanguage)) return "Other languages must not include default language.";
    if (slugChecking) return "Checking slug availability...";
    if (slugAvailable === false) return "Slug already exists.";
    if (slugAvailable === null) return "Checking slug availability...";
    return null;
  }, [newName, newSlug, defaultLanguage, otherLanguages, slugChecking, slugAvailable]);

  const canCreate = !saving && !createError;

  const slugStatusMessage = useMemo(() => {
    if (slugChecking) return "Checking slug...";
    if (slugAvailable === false) return "Slug already exists";
    if (slugAvailable === true) return "Slug is available";
    return "Used in URLs. Auto-generated from project name.";
  }, [slugChecking, slugAvailable]);

  const slugExists = slugAvailable === false;

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

  const toggleOtherLanguage = (lang: string) => {
    setOtherLanguages((prev) => {
      if (prev.includes(lang)) return prev.filter((l) => l !== lang);
      return [...prev, lang];
    });
  };

  const handleCreate = async () => {
    if (!canCreate) return;

    setSaving(true);
    setError(null);
    try {
      const project = await onCreateProject({
        name: newName.trim(),
        slug: newSlug,
        defaultLanguage,
        otherLanguages,
      });
      setSelectedSlug(project.slug);
      setMode("link");
    } catch (e) {
      console.error("[Lokalit] Create project failed:", e);
      setError(e instanceof Error ? e.message : "Failed to create project. Please try again.");
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
          <button
            className="btn-secondary btn-sm"
            disabled={saving}
            onClick={() => {
              setError(null);
              setMode((prev) => (prev === "link" ? "create" : "link"));
            }}
          >
            {mode === "link" ? "New project" : "Back to link"}
          </button>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {mode === "link" ? (
          <>
            <div>
              <label htmlFor="linked-project-select">Linked project</label>
              <select id="linked-project-select" value={selectedSlug} onChange={(e) => setSelectedSlug(e.target.value)}>
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
          </>
        ) : (
          <>
            <div>
              <label htmlFor="new-project-name">Project name</label>
              <input
                id="new-project-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Mobile App"
              />
            </div>

            <div>
              <label htmlFor="new-project-slug">Slug</label>
              <input
                id="new-project-slug"
                type="text"
                value={newSlug}
                readOnly
                placeholder="auto-generated from name"
                style={slugExists ? { borderColor: "#e53e3e" } : undefined}
              />
              <p
                className="muted"
                style={{
                  marginTop: 4,
                  color: slugExists ? "#e53e3e" : undefined,
                }}
              >
                {slugStatusMessage}
              </p>
            </div>

            <div>
              <label htmlFor="new-project-default-language">Default language</label>
              <select
                id="new-project-default-language"
                value={defaultLanguage}
                onChange={(e) => {
                  const next = e.target.value;
                  setDefaultLanguage(next);
                  setOtherLanguages((prev) => prev.filter((l) => l !== next));
                }}
              >
                {allLanguages.map((lang) => (
                  <option key={lang.key} value={lang.key}>{lang.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="new-project-other-languages">Other languages</label>
              <div
                id="new-project-other-languages"
                style={{
                  maxHeight: 120,
                  overflowY: "auto",
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  padding: 8,
                }}
              >
                {allLanguages
                  .filter((lang) => lang.key !== defaultLanguage)
                  .map((lang) => (
                    <label key={lang.key} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <input
                        type="checkbox"
                        checked={otherLanguages.includes(lang.key)}
                        onChange={() => toggleOtherLanguage(lang.key)}
                      />
                      <span>{lang.name}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <div className="fill" />
              <button className="btn-secondary btn-sm" onClick={onClose}>Cancel</button>
              <button
                className="btn-primary btn-sm"
                style={{ background: "#007a55" }}
                disabled={!canCreate}
                onClick={handleCreate}
              >
                Create project
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
