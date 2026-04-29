import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/director/tariffs")({ component: HiddenTariffsPage });

function HiddenTariffsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/director", replace: true });
  }, [navigate]);

  return null;
}
