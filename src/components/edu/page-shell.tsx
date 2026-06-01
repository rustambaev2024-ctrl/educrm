import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, actions, children }: PageShellProps) {
  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: "#0f172a", margin: 0, lineHeight: 1.3 }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: "#64748b", marginTop: 2, marginBottom: 0 }}>
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
      <div style={{ height: 1, background: "#f1f5f9", marginBottom: 14 }} />
      {children}
    </div>
  );
}
