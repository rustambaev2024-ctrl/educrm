import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/edu/page-header";
import { MessengerPanel } from "@/components/edu/messenger-panel";

export const Route = createFileRoute("/director/messages")({ component: MessagesPage });

function MessagesPage() {
  return (
    <>
      <PageHeader title="Сообщения" description="Групповые и личные чаты" />
      <MessengerPanel />
    </>
  );
}
