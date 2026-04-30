import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/edu/page-header";
import { ChatFrozenNotice } from "@/components/edu/chat-frozen-notice";

export const Route = createFileRoute("/admin/messages")({ component: MessagesPage });

function MessagesPage() {
  return (
    <>
      <PageHeader title="Сообщения" description="Раздел временно недоступен" />
      <ChatFrozenNotice />
    </>
  );
}
