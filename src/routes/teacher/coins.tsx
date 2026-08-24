import { createFileRoute } from "@tanstack/react-router";

import { CoinStudentsTab } from "@/components/edu/coin-students-tab";
import { PageShell } from "@/components/edu/page-shell";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/teacher/coins")({ component: TeacherCoinsPage });

function TeacherCoinsPage() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);

  return (
    <PageShell
      title="Coins"
      subtitle={tr(
        "Faqat o'z guruhlaringiz o'quvchilariga coin berish va olish",
        "Начисление и списание монет только ученикам своих групп",
      )}
    >
      <CoinStudentsTab />
    </PageShell>
  );
}
