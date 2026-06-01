import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, ArrowRight, AlertCircle } from "lucide-react";
import { quizApi, getTenantSchema, setTenantSchema } from "@/lib/api";

export const Route = createFileRoute("/join")({ component: JoinPage });

interface SessionMeta {
  session_id: string;
  code: string;
  status: string;
  quiz_title: string;
  quiz_type: "student" | "lead";
  participants_count: number;
}

function JoinPage() {
  const navigate = useNavigate();

  // Если в URL передана схема (?schema=) — сохраняем её (мульти-тенант доступ без логина)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const schema = params.get("schema");
    if (schema && schema !== getTenantSchema()) setTenantSchema(schema);
  }

  const [stage, setStage] = useState<"code" | "info">("code");
  const [code, setCode] = useState("");
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (code.trim().length !== 6) {
      setError("Kodni to'liq kiriting");
      return;
    }
    setLoading(true);
    try {
      const res = (await quizApi.sessions.byCode(code.trim())) as SessionMeta;
      if (res.status !== "waiting") {
        setError("Sessiya allaqachon boshlangan");
        return;
      }
      setMeta(res);
      setStage("info");
    } catch {
      setError("Sessiya topilmadi");
    } finally {
      setLoading(false);
    }
  };

  const submitJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!meta) return;
    const isLead = meta.quiz_type === "lead";
    if (!name.trim()) {
      setError("Ism va familiyani kiriting");
      return;
    }
    if (isLead && (!phone.trim() || !parentName.trim() || !parentPhone.trim())) {
      setError("Barcha maydonlarni to'ldiring");
      return;
    }
    setLoading(true);
    try {
      const res = (await quizApi.sessions.join(meta.session_id, {
        name: name.trim(),
        phone: phone.trim(),
        birth_date: birthDate || null,
        parent_name: parentName.trim(),
        parent_phone: parentPhone.trim(),
      })) as { participant_id: string; name: string };

      sessionStorage.setItem(`quiz_participant_${meta.code}`, res.participant_id);
      sessionStorage.setItem(`quiz_name_${meta.code}`, res.name);
      navigate({ to: `/play/${meta.code}` as string });
    } catch {
      setError("Qo'shilishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  const isLead = meta?.quiz_type === "lead";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#0077b6] text-2xl font-bold">E</div>
          <h1 className="mt-4 text-2xl font-bold">EduCRM Quiz</h1>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {stage === "code" ? (
          <form onSubmit={submitCode} className="space-y-4">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoFocus
              className="w-full rounded-xl border border-white/15 bg-white/5 py-4 text-center font-mono text-3xl tracking-[0.4em] text-white placeholder:text-white/30 focus:border-[#0077b6] focus:outline-none"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0077b6] py-3.5 font-semibold transition-colors hover:bg-[#006da8] disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : <>Kirish <ArrowRight className="size-5" /></>}
            </button>
          </form>
        ) : (
          <form onSubmit={submitJoin} className="space-y-3">
            <div className="mb-2 text-center text-sm text-white/60">{meta?.quiz_title}</div>
            <Field label="Ism va familiya *" value={name} onChange={setName} autoFocus />
            <Field label={isLead ? "Telefon raqami *" : "Telefon (ixtiyoriy)"} value={phone} onChange={setPhone} type="tel" />
            {isLead && (
              <>
                <Field label="Tug'ilgan sana" value={birthDate} onChange={setBirthDate} type="date" />
                <Field label="Ota-ona ismi *" value={parentName} onChange={setParentName} />
                <Field label="Ota-ona telefoni *" value={parentPhone} onChange={setParentPhone} type="tel" />
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 font-semibold transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : "Qo'shilish"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-white/50">{label}</label>
      <input
        type={type}
        value={value}
        autoFocus={autoFocus}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2.5 text-white placeholder:text-white/30 focus:border-[#0077b6] focus:outline-none"
      />
    </div>
  );
}
