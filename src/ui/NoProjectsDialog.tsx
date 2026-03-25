import { useEffect, useMemo, useState } from "react";
import type { Language, Project } from "./types";

interface Props {
  allLanguages: Language[];
  onCheckSlugAvailable: (slug: string) => Promise<boolean>;
  onCreateProject: (input: {
    name: string;
    slug: string;
    defaultLanguage: string;
    otherLanguages: string[];
  }) => Promise<Project>;
  onProjectCreated: (project: Project) => Promise<void>;
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replaceAll(/[^a-z0-9\s-]/g, "")
    .replaceAll(/\s+/g, "-")
    .replaceAll(/-+/g, "-");
}

export function NoProjectsDialog({
  allLanguages,
  onCheckSlugAvailable,
  onCreateProject,
  onProjectCreated,
}: Props) {
  const [mode, setMode] = useState<"empty" | "create">("empty");
  const [newName, setNewName] = useState("");
  const newSlug = useMemo(() => toSlug(newName), [newName]);
  const [defaultLanguage, setDefaultLanguage] = useState(allLanguages[0]?.key ?? "en");
  const [otherLanguages, setOtherLanguages] = useState<string[]>([]);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await onProjectCreated(project);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" style={{ alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="dialog" style={{ maxWidth: 420, width: "100%", borderRadius: 12 }}>
        {mode === "empty" ? (
          <>
            <h2>No projects available</h2>
            <p className="muted">There is no project created or available, please create one first.</p>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <div className="fill" />
              <button className="btn-primary btn-sm" onClick={() => setMode("create")}>Create new project</button>
            </div>
          </>
        ) : (
          <>
            <h2>Create first project</h2>

            <div>
              <label htmlFor="first-project-name">Project name</label>
              <input
                id="first-project-name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Mobile App"
                disabled={saving}
              />
            </div>

            <div>
              <label htmlFor="first-project-slug">Slug</label>
              <input id="first-project-slug" type="text" value={newSlug} readOnly placeholder="auto-generated from name" />
              <p className="muted" style={{ marginTop: 4 }}>
                {slugStatusMessage}
              </p>
            </div>

            <div>
              <label htmlFor="first-project-default-language">Default language</label>
              <select
                id="first-project-default-language"
                value={defaultLanguage}
                onChange={(e) => {
                  const next = e.target.value;
                  setDefaultLanguage(next);
                  setOtherLanguages((prev) => prev.filter((l) => l !== next));
                }}
                disabled={saving}
              >
                {allLanguages.map((lang) => (
                  <option key={lang.key} value={lang.key}>{lang.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="first-project-other-languages">Other languages</label>
              <div
                id="first-project-other-languages"
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
                        disabled={saving}
                      />
                      <span>{lang.name}</span>
                    </label>
                  ))}
              </div>
            </div>

            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <button className="btn-secondary btn-sm" disabled={saving} onClick={() => setMode("empty")}>Back</button>
              <div className="fill" />
              <button className="btn-primary btn-sm" disabled={!canCreate} onClick={handleCreate}>
                {saving ? "Creating..." : "Create new project"}
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
