import { createFileRoute } from "@tanstack/react-router";
import { QuizSessionPage } from "@/components/edu/quiz-session-page";

export const Route = createFileRoute("/admin/quiz-session/$sessionId")({
  component: () => <QuizSessionPage basePath="/admin" />,
});
