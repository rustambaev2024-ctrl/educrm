import { createFileRoute } from "@tanstack/react-router";
import { QuizCreatePage } from "@/components/edu/quiz-create-page";

export const Route = createFileRoute("/admin/quiz-create")({
  component: () => <QuizCreatePage basePath="/admin" />,
});
