import { createFileRoute } from "@tanstack/react-router";
import { QuizSessionPage } from "@/components/edu/quiz-session-page";

export const Route = createFileRoute("/teacher/quiz-session/$sessionId")({
  component: () => <QuizSessionPage basePath="/teacher" />,
});
