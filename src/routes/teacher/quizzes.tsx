import { createFileRoute } from "@tanstack/react-router";
import { QuizzesPage } from "../admin/quizzes";

export const Route = createFileRoute("/teacher/quizzes")({
  component: () => <QuizzesPage basePath="/teacher" />,
});
