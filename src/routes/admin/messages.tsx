import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/edu/page-header";
import { MessengerPanel } from "@/components/edu/messenger-panel";
import { useAuth } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/messages")({ component: AdminMessagesPage });

function AdminMessagesPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  return (
    <>
      <PageHeader title={t("msg.title")} description={t("msg.subtitle")} />
      <div className="p-4 md:p-8">
        <MessengerPanel threadFilter={(th) => !!user?.id && th.participantIds.includes(user.id)} />
      </div>
    </>
  );
}
