import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/edu/page-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CenterSummaryTab } from "@/components/edu/center-summary-tab";
import { FinanceAnalyticsTab } from "@/components/edu/finance-analytics-tab";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin/analytics")({ component: AdminAnalytics });

/**
 * Каркас вкладок; цифры считает бэкенд. Скоуп по филиалу администратору
 * сужает сам сервер (branch_ids_for_user), поэтому переключателя филиала
 * здесь нет и CenterSummaryTab вызывается без branchId.
 */
function AdminAnalytics() {
  const { t } = useI18n();

  return (
    <PageShell title={t("nav.analytics")} subtitle={t("admin.subtitle")}>
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
