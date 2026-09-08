import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/edu/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CenterSummaryTab } from "@/components/edu/center-summary-tab";
import { FinanceAnalyticsTab } from "@/components/edu/finance-analytics-tab";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/analytics")({ component: AnalyticsPage });

/**
 * Страница — только каркас вкладок: обе вкладки считают свои цифры на
 * бэкенде и грузят их сами. Раньше «Обзор» собирался здесь же из сырых
 * списков useData() на клиенте, из-за чего показывал не то же самое, что
 * отчёты, и не умел ни период, ни экспорт.
 */
function AnalyticsPage() {
  const { t } = useI18n();

  return (
    <PageShell title={t("nav.analytics")} subtitle={t("director.subtitle")}>
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">{t("financeAnalytics.overviewTab")}</TabsTrigger>
          <TabsTrigger value="finance">{t("financeAnalytics.tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <CenterSummaryTab />
        </TabsContent>
        <TabsContent value="finance">
          <FinanceAnalyticsTab />
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
