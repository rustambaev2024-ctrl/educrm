import { createFileRoute } from "@tanstack/react-router";
import { DailyReportPage } from "@/components/edu/daily-report-page";

export const Route = createFileRoute("/director/daily-report")({
  component: DailyReportPage,
});