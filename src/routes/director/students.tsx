import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage, validateStudentsSearch } from "../admin/students";

/* Тот же экран и тот же параметр `?student=<id>`, что и у администратора:
   с доски заявок директора должна открываться карточка созданного
   ученика, а не пустой список. */
export const Route = createFileRoute("/director/students")({
  component: StudentsPage,
  validateSearch: validateStudentsSearch,
});
