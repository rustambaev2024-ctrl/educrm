import type { ReactNode } from "react";

interface PageShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function PageShell({ title, subtitle, actions, children }: PageShellProps) {
  return (
    <div style={{ padding: "24px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0077b6", margin: 0, lineHeight: 1.2 }}>{title}</h1>
          {subtitle && (
            <p style={{ fontSize: 13, color: "#00b4d8", marginTop: 2, marginBottom: 0 }}>{subtitle}</p>
          )}
        </div>
        {actions && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
            {actions}
          </div>
        )}
      </div>
      <div style={{ height: 1, background: "#e0f2fe", marginBottom: 14 }} />
      {children}
    </div>
  );
}
