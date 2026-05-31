import { createFileRoute } from "@tanstack/react-router";
import { QuizCreatePage } from "@/components/edu/quiz-create-page";

export const Route = createFileRoute("/teacher/quiz-create")({
  component: () => <QuizCreatePage basePath="/teacher" />,
});
