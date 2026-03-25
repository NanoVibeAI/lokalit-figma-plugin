import React, { useState, useRef, useEffect } from "react";
import type { Project, Language } from "./types";

interface Props {
  userEmail: string | null;
  projects: Project[];
  allLanguages: Language[];
  currentProjectSlug: string | null;
  currentLanguage: string | null;
  onProjectSelect: (slug: string) => Promise<void>;
  onLanguageSelect: (lang: string) => void;
  onLogout: () => void;
  linked: boolean;
}

export function HeaderDropdown({
  userEmail,
  projects,
  allLanguages,
  currentProjectSlug,
  currentLanguage,
  onProjectSelect,
  onLanguageSelect,
  onLogout,
  linked,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredMenu, setHoveredMenu] = useState<"project" | "language" | null>(null);
  const [selecting, setSelecting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const currentProject = projects.find((p) => p.slug === currentProjectSlug);
  const projectLanguages = currentProject
    ? [currentProject.default_language, ...currentProject.other_languages]
    : [];
  const effectiveLanguage = currentLanguage || currentProject?.default_language || null;
  const currentLanguageLabel = effectiveLanguage
    ? allLanguages.find((l) => l.key === effectiveLanguage)?.name || effectiveLanguage
    : null;
  const triggerLabel = currentProject
    ? `${currentProject.name}${currentLanguageLabel ? ` (${currentLanguageLabel})` : ""}`
    : "No project selected";

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleProjectSelect = async (slug: string) => {
    setSelecting(true);
    try {
      await onProjectSelect(slug);
      setIsOpen(false);
    } finally {
      setSelecting(false);
    }
  };

  const handleLanguageSelect = (lang: string) => {
    onLanguageSelect(lang);
    setIsOpen(false);
  };

  const handleLogout = () => {
    onLogout();
    setIsOpen(false);
  };

  return (
    <div style={{ position: "relative", display: "inline-block", maxWidth: "100%" }} ref={dropdownRef}>
      {/* Dropdown Trigger */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          maxWidth: "100%",
          height: 32,
          padding: "0 10px",
          border: "1px solid #ccc",
          borderRadius: 4,
          background: "#fff",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          color: "#333",
          fontSize: 11,
          transition: "background 0.2s, color 0.2s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "#f5f5f5";
          (e.currentTarget as HTMLElement).style.color = "#333";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "#fff";
          (e.currentTarget as HTMLElement).style.color = "#666";
        }}
        title="Project menu"
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: "#333",
            maxWidth: 220,
            textAlign: "left",
            flex: 1,
          }}
        >
          {triggerLabel}
        </span>
        <span style={{ fontSize: 10, lineHeight: 1, color: "#666" }}>▾</span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "#fff",
            border: "1px solid #ccc",
            borderRadius: 4,
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            zIndex: 1000,
            minWidth: 150,
          }}
        >
          {/* Signed in as header */}
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid #e5e5e5",
              fontSize: 11,
              color: "#666",
              fontWeight: 500,
              whiteSpace: "nowrap",
            }}
          >
            Signed as {userEmail || "…"}
          </div>

          {/* Project Menu Item with Submenu */}
          {projects.length > 0 && (
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setHoveredMenu("project")}
              onMouseLeave={() => setHoveredMenu(null)}
            >
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 11,
                  color: "#333",
                  background: hoveredMenu === "project" ? "#f5f5f5" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid #e5e5e5",
                  transition: "background 0.15s",
                }}
              >
                <span>Project</span>
                <span style={{ fontSize: 9, color: "#999" }}>▸</span>
              </div>

              {/* Project Submenu */}
              {hoveredMenu === "project" && (
                <div
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: 0,
                    marginLeft: 2,
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    minWidth: 150,
                    maxHeight: 300,
                    overflowY: "auto",
                    zIndex: 1001,
                  }}
                >
                  {projects.map((proj) => (
                    <div
                      key={proj.slug}
                      onClick={() => handleProjectSelect(proj.slug)}
                      style={{
                        padding: "10px 12px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: selecting ? "default" : "pointer",
                        background:
                          currentProjectSlug === proj.slug ? "#f0f0f0" : "#fff",
                        borderBottom: "1px solid #f0f0f0",
                        fontSize: 11,
                        color: "#333",
                        opacity: selecting && currentProjectSlug !== proj.slug ? 0.5 : 1,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        if (!selecting) {
                          (e.currentTarget as HTMLElement).style.background = "#f5f5f5";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          currentProjectSlug === proj.slug ? "#f0f0f0" : "#fff";
                      }}
                    >
                      <span style={{ flex: 1 }}>{proj.name}</span>
                      {currentProjectSlug === proj.slug && (
                        <span style={{ fontSize: 12, color: "#007a55", fontWeight: 600 }}>
                          ✓
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Language Menu Item with Submenu */}
          {projectLanguages.length > 0 && (
            <div
              style={{ position: "relative" }}
              onMouseEnter={() => setHoveredMenu("language")}
              onMouseLeave={() => setHoveredMenu(null)}
            >
              <div
                style={{
                  padding: "10px 12px",
                  fontSize: 11,
                  color: "#333",
                  background: hoveredMenu === "language" ? "#f5f5f5" : "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderTop: "1px solid #e5e5e5",
                  transition: "background 0.15s",
                }}
              >
                <span>Language</span>
                <span style={{ fontSize: 9, color: "#999" }}>▸</span>
              </div>

              {/* Language Submenu */}
              {hoveredMenu === "language" && (
                <div
                  style={{
                    position: "absolute",
                    left: "100%",
                    top: 0,
                    marginLeft: 2,
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: 4,
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    minWidth: 150,
                    maxHeight: 300,
                    overflowY: "auto",
                    zIndex: 1001,
                  }}
                >
                  {projectLanguages.map((langCode) => {
                    const langObj = allLanguages.find((l) => l.key === langCode);
                    const label = langObj ? langObj.name : langCode;
                    return (
                      <div
                        key={langCode}
                        onClick={() => handleLanguageSelect(langCode)}
                        style={{
                          padding: "10px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          cursor: "pointer",
                          background:
                            effectiveLanguage === langCode ? "#f0f0f0" : "#fff",
                          borderBottom: "1px solid #f0f0f0",
                          fontSize: 11,
                          color: "#333",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = "#f5f5f5";
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background =
                            effectiveLanguage === langCode ? "#f0f0f0" : "#fff";
                        }}
                      >
                        <span>{label}</span>
                        {effectiveLanguage === langCode && (
                          <span style={{ fontSize: 12, color: "#007a55", fontWeight: 600 }}>
                            ✓
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Logout */}
          <div
            onClick={handleLogout}
            style={{
              padding: "10px 12px",
              cursor: "pointer",
              background: "#fff",
              borderTop: "1px solid #e5e5e5",
              fontSize: 11,
              color: "#d9534f",
              fontWeight: 500,
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#fff5f5";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "#fff";
            }}
          >
            Logout
          </div>
        </div>
      )}
    </div>
  );
}
