import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { API_BASE_URL, getTenantSchema } from "@/lib/api";
import { GraduationCap, Send, CheckCircle2, Phone, User, MessageSquare, Loader2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/apply")({
  component: PublicApplyPage,
});

function PublicApplyPage() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!fullName.trim() || !phone.trim() || phone.trim().length < 9) {
      setError("Iltimos, ismingiz va telefon raqamingizni to'ldiring");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/public/lead/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-Schema": getTenantSchema(),
        },
        body: JSON.stringify({
          full_name: fullName.trim(),
          phone: phone.trim(),
          notes: notes.trim(),
          source: "other",
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as Record<string, string>).detail || "Xatolik yuz berdi");
      }

      setIsSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Xatolik yuz berdi. Qayta urinib ko'ring.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="apply-page">
        <div className="apply-bg" />
        <div className="apply-container">
          <div className="apply-success-card">
            <div className="apply-success-icon">
              <CheckCircle2 size={48} />
            </div>
            <h2>Murojaatingiz qabul qilindi! ✨</h2>
            <p>Tez orada siz bilan bog'lanamiz. Rahmat!</p>
            <p className="apply-success-sub">Ваша заявка принята! Мы скоро свяжемся с вами.</p>
            <button
              className="apply-btn"
              onClick={() => {
                setIsSuccess(false);
                setFullName("");
                setPhone("+998");
                setNotes("");
              }}
            >
              Yana murojaat qilish
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="apply-page">
      <div className="apply-bg" />
      <div className="apply-container">
        {/* Header */}
        <div className="apply-header">
          <div className="apply-logo">
            <GraduationCap size={32} />
          </div>
          <h1>
            <span className="apply-gradient-text">Kelajak Ta'lim</span>
          </h1>
          <p className="apply-tagline">O'quv markaziga yozilish uchun quyidagi formani to'ldiring</p>
          <p className="apply-tagline-ru">Заполните форму для записи в учебный центр</p>
        </div>

        {/* Form Card */}
        <form className="apply-card" onSubmit={handleSubmit}>
          <div className="apply-card-header">
            <Sparkles size={20} />
            <span>Ro'yxatdan o'tish / Регистрация</span>
          </div>

          <div className="apply-field">
            <label htmlFor="apply-name">
              <User size={16} />
              <span>Ismingiz / Ваше имя <span className="apply-required">*</span></span>
            </label>
            <input
              id="apply-name"
              type="text"
              placeholder="F.I.Sh. (Masalan: Aliyev Shahzod)"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div className="apply-field">
            <label htmlFor="apply-phone">
              <Phone size={16} />
              <span>Telefon raqam / Номер телефона <span className="apply-required">*</span></span>
            </label>
            <input
              id="apply-phone"
              type="tel"
              placeholder="+998 90 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="apply-field">
            <label htmlFor="apply-notes">
              <MessageSquare size={16} />
              <span>Izoh / Комментарий</span>
            </label>
            <textarea
              id="apply-notes"
              placeholder="Qaysi kursga qiziqasiz? Qo'shimcha ma'lumot... / Какой курс интересует?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="apply-error">{error}</div>}

          <button type="submit" className="apply-btn" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="apply-spinner" />
                Yuborilmoqda...
              </>
            ) : (
              <>
                <Send size={18} />
                Yuborish / Отправить
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="apply-footer">
          <p>© {new Date().getFullYear()} Kelajak Ta'lim. Barcha huquqlar himoyalangan.</p>
        </div>
      </div>
    </div>
  );
}
