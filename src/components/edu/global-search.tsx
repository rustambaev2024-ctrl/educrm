import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, GraduationCap, Users, Layers, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { studentApi, staffApi } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

interface SearchResult {
  id: string;
  type: "student" | "staff" | "group";
  name: string;
  sub?: string;
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { lang } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const [studentsRes, staffRes] = await Promise.all([
          studentApi.list({ search: query, page_size: "5" }),
          staffApi.list({ search: query, page_size: "5" }),
        ]);
        const studentsList = (Array.isArray(studentsRes) ? studentsRes : (studentsRes as any).results ?? []).map((s: any) => ({
          id: s.id,
          type: "student" as const,
          name: s.full_name || s.user?.full_name || "—",
          sub: s.phone || s.user?.phone,
        }));
        const staffList = (Array.isArray(staffRes) ? staffRes : (staffRes as any).results ?? []).map((s: any) => ({
          id: s.id,
          type: "staff" as const,
          name: s.full_name || s.user?.full_name || "—",
          sub: s.role || s.user?.role,
        }));
        setResults([...studentsList, ...staffList]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onClose();
    const role = user?.role;
    if (result.type === "student") {
      navigate({ to: role === "director" ? "/director/students" : "/admin/students" });
    } else if (result.type === "staff") {
      navigate({ to: "/director/staff" });
    }
  };

  const icons = { student: GraduationCap, staff: Users, group: Layers };
  const typeLabels = {
    student: lang === "uz" ? "O'quvchi" : "Студент",
    staff: lang === "uz" ? "Xodim" : "Сотрудник",
    group: lang === "uz" ? "Guruh" : "Группа",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 text-muted-foreground mr-2 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === "uz" ? "O'quvchi, xodim, guruh..." : "Студент, сотрудник, группа..."}
            className="flex-1 py-4 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto py-2">
          {loading && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          )}
          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {lang === "uz" ? "Natija topilmadi" : "Ничего не найдено"}
            </div>
          )}
          {!loading && query.length < 2 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              {lang === "uz" ? "Qidirish uchun 2+ harf kiriting" : "Введите 2+ символа для поиска"}
            </div>
          )}
          {results.map((result) => {
            const Icon = icons[result.type];
            return (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-accent text-left transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary flex-shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{result.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {typeLabels[result.type]}{result.sub ? ` · ${result.sub}` : ""}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
