import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  Check,
  Gem,
  Headphones,
  LockKeyhole,
  MessageSquare,
  Rocket,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/edu/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useData } from "@/lib/data/store";
import { formatMoney } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/tariffs")({ component: DirectorTariffsPage });

type PlanKey = "basic" | "standard" | "pro";

interface TariffPlan {
  key: PlanKey;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  yearlyDiscount: number;
  studentLimit: number | "unlimited";
  branchLimit: number | "unlimited";
  userLimit: number | "unlimited";
  accent: string;
  icon: typeof Gem;
  bestFor: string;
  features: string[];
  missing?: string[];
}

const PLANS: TariffPlan[] = [
  {
    key: "basic",
    name: "Basic",
    tagline: "Start for one branch",
    description: "For a small center that needs clean student records, groups, schedule and payment control.",
    monthlyPrice: 2_000_000,
    yearlyDiscount: 10,
    studentLimit: 150,
    branchLimit: 1,
    userLimit: 12,
    accent: "from-slate-500 to-slate-700",
    icon: Building2,
    bestFor: "1 branch, first CRM launch",
    features: [
      "Students, parents and staff profiles",
      "Courses, groups and schedule",
      "Attendance and homework basics",
      "Wallet balance and payment history",
      "Director dashboard",
    ],
    missing: ["Advanced analytics", "Multi-branch controls", "Priority support"],
  },
  {
    key: "standard",
    name: "Standard",
    tagline: "Most balanced for growth",
    description: "For an active education center with multiple admins, stable finance process and daily analytics.",
    monthlyPrice: 5_000_000,
    yearlyDiscount: 15,
    studentLimit: 700,
    branchLimit: 3,
    userLimit: 45,
    accent: "from-cyan-500 to-blue-600",
    icon: Rocket,
    bestFor: "Growing center, 2-3 branches",
    features: [
      "Everything in Basic",
      "Branch-level operations",
      "Teacher effectiveness analytics",
      "Chat and realtime notifications",
      "Excel/PDF reports",
      "Salary calculation support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "Scale without operational chaos",
    description: "For a network of branches where the director needs control, audit, reporting and high support speed.",
    monthlyPrice: 12_000_000,
    yearlyDiscount: 20,
    studentLimit: "unlimited",
    branchLimit: "unlimited",
    userLimit: "unlimited",
    accent: "from-violet-500 to-fuchsia-600",
    icon: Sparkles,
    bestFor: "Network, franchise, high volume",
    features: [
      "Everything in Standard",
      "Unlimited branches and users",
      "Advanced audit and control reports",
      "Custom onboarding checklist",
      "Priority support channel",
      "Dedicated success review",
    ],
  },
];

const COMPARE = [
  { label: "Student CRM", basic: true, standard: true, pro: true },
  { label: "Groups, schedule, rooms", basic: true, standard: true, pro: true },
  { label: "Finance and debtors", basic: true, standard: true, pro: true },
  { label: "Realtime chat and notifications", basic: false, standard: true, pro: true },
  { label: "PDF / Excel reports", basic: false, standard: true, pro: true },
  { label: "Teacher salary calculation", basic: false, standard: true, pro: true },
  { label: "Advanced audit logs", basic: false, standard: false, pro: true },
  { label: "Priority onboarding", basic: false, standard: false, pro: true },
];

function DirectorTariffsPage() {
  const { lang } = useI18n();
  const { students, branches, staff } = useData();
  const [yearly, setYearly] = useState(false);
  const [studentCount, setStudentCount] = useState(Math.max(students.length, 120));
  const recommended = useMemo(() => recommendPlan(studentCount, branches.length, staff.length), [studentCount, branches.length, staff.length]);

  const priceOf = (plan: TariffPlan) => {
    const monthly = yearly
      ? plan.monthlyPrice * 12 * (1 - plan.yearlyDiscount / 100)
      : plan.monthlyPrice;
    return monthly;
  };

  const selectPlan = (plan: TariffPlan) => {
    toast.success(`${plan.name}: request sent to platform owner`);
  };

  return (
    <>
      <PageHeader
        title="Tariflar"
        description="Choose the right EduCRM plan for your center. Compare limits, reports, support and operational control before scaling."
        actions={
          <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 p-2 shadow-elegant sm:w-auto">
            <span className={!yearly ? "px-2 text-sm font-semibold" : "px-2 text-sm text-muted-foreground"}>Monthly</span>
            <Switch checked={yearly} onCheckedChange={setYearly} aria-label="Toggle yearly billing" />
            <span className={yearly ? "px-2 text-sm font-semibold" : "px-2 text-sm text-muted-foreground"}>Yearly</span>
          </div>
        }
      />

      <div className="space-y-6 p-4 md:p-8">
        <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <Card className="relative overflow-hidden border-border/70 bg-[radial-gradient(circle_at_10%_10%,hsl(var(--primary)/0.18),transparent_34%),linear-gradient(135deg,hsl(var(--card)),hsl(var(--card)/0.72))] p-5 shadow-elegant-lg md:p-7">
            <div className="absolute right-6 top-6 hidden size-24 rounded-full bg-primary/10 blur-2xl md:block" />
            <Badge className="mb-4 border-primary/30 bg-primary/15 text-primary hover:bg-primary/20">Director decision map</Badge>
            <h2 className="max-w-3xl text-2xl font-bold tracking-tight md:text-4xl">
              Pick a tariff by operational load, not by price alone.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Basic is enough for first structure. Standard is the safe default for a working education center.
              Pro is for networks where audit, branches, realtime communication and support speed matter every day.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Signal icon={Users} label="Current students" value={String(students.length)} />
              <Signal icon={Building2} label="Branches" value={String(branches.length)} />
              <Signal icon={ShieldCheck} label="Recommended" value={capitalize(recommended)} />
            </div>
          </Card>

          <Card className="p-5 shadow-elegant md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-warning/15 text-warning">
                <Zap className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">Fast estimator</div>
                <div className="text-xs text-muted-foreground">Adjust student count to see the safest plan.</div>
              </div>
            </div>
            <div className="mt-5 space-y-2">
              <Label htmlFor="studentCount">Expected active students</Label>
              <Input
                id="studentCount"
                type="number"
                min={0}
                value={studentCount}
                onChange={(event) => setStudentCount(Math.max(0, Number(event.target.value)))}
              />
            </div>
            <div className="mt-5 rounded-2xl border border-border/70 bg-secondary/50 p-4">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Recommendation</div>
              <div className="mt-1 text-2xl font-bold">{capitalize(recommended)}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Based on students, branches and staff count. You can still select any plan manually.
              </p>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const active = plan.key === recommended;
            return (
              <Card
                key={plan.key}
                className={`group relative flex min-h-[560px] flex-col overflow-hidden border-border/70 p-5 shadow-elegant transition-all hover:-translate-y-1 hover:shadow-elegant-lg md:p-6 ${
                  active ? "ring-2 ring-primary/55" : ""
                }`}
              >
                <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${plan.accent}`} />
                {active && (
                  <div className="absolute right-4 top-4 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
                    Recommended
                  </div>
                )}
                <div className={`mb-5 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${plan.accent} text-white shadow-glow`}>
                  <Icon className="size-6" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{plan.name}</div>
                  <div className="mt-1 text-sm font-medium text-primary">{plan.tagline}</div>
                  <p className="mt-3 min-h-[72px] text-sm leading-6 text-muted-foreground">{plan.description}</p>
                </div>

                <div className="my-5 rounded-2xl border border-border/70 bg-secondary/40 p-4">
                  <div className="flex items-end gap-2">
                    <span className="text-3xl font-bold tabular-nums">{formatMoney(priceOf(plan), lang)}</span>
                    <span className="pb-1 text-xs text-muted-foreground">{yearly ? "/ year" : "/ month"}</span>
                  </div>
                  {yearly && (
                    <div className="mt-2 text-xs font-medium text-success">Save {plan.yearlyDiscount}% with annual billing</div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <Limit label="Students" value={plan.studentLimit} />
                  <Limit label="Branches" value={plan.branchLimit} />
                  <Limit label="Users" value={plan.userLimit} />
                </div>

                <div className="mt-5 flex-1 space-y-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Included</div>
                  {plan.features.map((feature) => (
                    <Feature key={feature} included label={feature} />
                  ))}
                  {plan.missing?.map((feature) => (
                    <Feature key={feature} included={false} label={feature} />
                  ))}
                </div>

                <Button onClick={() => selectPlan(plan)} className="mt-6 w-full gap-2">
                  {active ? "Keep / request this plan" : "Request plan"} <ArrowRight className="size-4" />
                </Button>
                <div className="mt-3 text-center text-xs text-muted-foreground">{plan.bestFor}</div>
              </Card>
            );
          })}
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <Card className="overflow-hidden p-0 shadow-elegant">
            <div className="border-b border-border/70 p-5">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl bg-success/15 text-success">
                  <Wallet className="size-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Director checklist</h3>
                  <p className="text-sm text-muted-foreground">Use this before changing plan.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <ChecklistItem title="If you have one branch" body="Start with Basic unless you need reports, realtime chat or salary automation." />
              <ChecklistItem title="If admins work daily in CRM" body="Standard is safer: it includes reports, notifications and multi-role operations." />
              <ChecklistItem title="If you manage a network" body="Choose Pro when audit, unlimited branches and priority support reduce management risk." />
            </div>
          </Card>

          <Card className="overflow-hidden shadow-elegant">
            <div className="border-b border-border/70 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Feature comparison</h3>
                  <p className="text-sm text-muted-foreground">Quick view of what changes between tariffs.</p>
                </div>
                <Badge variant="outline" className="w-fit">No hidden modules</Badge>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="p-4 font-medium">Capability</th>
                    <th className="p-4 text-center font-medium">Basic</th>
                    <th className="p-4 text-center font-medium">Standard</th>
                    <th className="p-4 text-center font-medium">Pro</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((row) => (
                    <tr key={row.label} className="border-b border-border/50 last:border-0">
                      <td className="p-4 font-medium">{row.label}</td>
                      <td className="p-4"><Compare value={row.basic} /></td>
                      <td className="p-4"><Compare value={row.standard} /></td>
                      <td className="p-4"><Compare value={row.pro} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
            <InfoCard icon={LockKeyhole} title="Data stays separated" body="Your institution data remains in a private secure workspace. Changing tariff does not merge data with other centers." />
          <InfoCard icon={MessageSquare} title="Realtime where it matters" body="Standard and Pro keep daily work visible through chat and notification events for staff, students and parents." />
          <InfoCard icon={Headphones} title="Support level changes" body="Basic gets normal support. Standard gets faster operational support. Pro gets priority review for scale issues." />
        </section>
      </div>
    </>
  );
}

function recommendPlan(students: number, branches: number, staff: number): PlanKey {
  if (students > 700 || branches > 3 || staff > 45) return "pro";
  if (students > 150 || branches > 1 || staff > 12) return "standard";
  return "basic";
}

function capitalize(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function Signal({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
      <Icon className="mb-3 size-5 text-primary" />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: number | "unlimited" }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value === "unlimited" ? "∞" : value}</div>
    </div>
  );
}

function Feature({ included, label }: { included: boolean; label: string }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${included ? "text-foreground" : "text-muted-foreground"}`}>
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${included ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
        {included ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      </span>
      <span>{label}</span>
    </div>
  );
}

function Compare({ value }: { value: boolean }) {
  return (
    <div className="flex justify-center">
      <span className={`flex size-7 items-center justify-center rounded-full ${value ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
        {value ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
    </div>
  );
}

function ChecklistItem({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        <BadgeCheck className="size-4" />
      </div>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function InfoCard({ icon: Icon, title, body }: { icon: typeof BarChart3; title: string; body: string }) {
  return (
    <Card className="p-5 shadow-elegant">
      <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-accent text-primary">
        <Icon className="size-5" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
    </Card>
  );
}
