import { createFileRoute } from "@tanstack/react-router";
import { StudentsPage } from "../admin/students";

export const Route = createFileRoute("/director/students")({ component: StudentsPage });
