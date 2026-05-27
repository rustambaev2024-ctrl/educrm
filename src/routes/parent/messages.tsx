import { createFileRoute } from "@tanstack/react-router";
import { MessengerPanel } from "@/components/edu/messenger-panel";

export const Route = createFileRoute("/parent/messages")({ component: MessagesPage });

function MessagesPage() {
  return <MessengerPanel />;
}
