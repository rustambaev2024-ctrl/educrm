import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/edu/page-shell";
import { MessengerPanel } from "@/components/edu/messenger-panel";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/support-teacher/messages")({ component: MessagesPage });

function MessagesPage() {
  const { lang } = useI18n();
  return (
    <PageShell
      title={lang === "uz" ? "Xabarlar" : "Сообщения"}
      subtitle={lang === "uz" ? "Guruhli va shaxsiy chatlar" : "Групповые и личные чаты"}
    >
      <MessengerPanel />
    </PageShell>
  );
}
