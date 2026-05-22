import { createFileRoute } from "@tanstack/react-router"
import { NazoratPage } from "@/components/edu/nazorat-page"

export const Route = createFileRoute("/director/penalties")({
  component: NazoratPage,
})
