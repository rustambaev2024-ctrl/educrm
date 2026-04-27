import { createFileRoute } from "@tanstack/react-router";
import { MessengerPanel } from "@/components/edu/messenger-panel";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/student/messages")({ component: StudentMessagesPage });

function StudentMessagesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md px-3 py-3">
      <h1 className="mb-3 px-1 text-xl font-bold">{t("msg.title")}</h1>
      <MessengerPanel mobileMode threadFilter={(th) => !!user?.id && th.participantIds.includes(user.id)} />
    </div>
  );
}
