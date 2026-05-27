import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/edu/page-header";
import { MessengerPanel } from "@/components/edu/messenger-panel";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/messages")({ component: MessagesPage });

function MessagesPage() {
  const { lang } = useI18n();
  return (
    <>
      <PageHeader
        title={lang === "uz" ? "Xabarlar" : "Сообщения"}
        description={lang === "uz" ? "Guruhli va shaxsiy chatlar" : "Групповые и личные чаты"}
      />
      <MessengerPanel />
    </>
  );
}
