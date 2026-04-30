import { createFileRoute } from "@tanstack/react-router";
import { ChatFrozenNotice } from "@/components/edu/chat-frozen-notice";

export const Route = createFileRoute("/student/messages")({ component: MessagesPage });

function MessagesPage() {
  return <ChatFrozenNotice />;
}
