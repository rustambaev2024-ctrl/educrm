import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Building2, MapPin, Users, DoorOpen, Layers } from "lucide-react";
import { PageHeader } from "@/components/edu/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/director/branches")({ component: BranchesPage });

function BranchesPage() {
  const { t } = useI18n();
  const { branches, rooms, staff, students, groups } = useData();

  const stats = useMemo(() => {
    return branches.map((b) => {
      const branchRooms = rooms.filter((r) => r.branchId === b.id);
      const branchStaff = staff.filter((s) => s.branchId === b.id);
      const branchStudents = students.filter((s) => s.branchId === b.id);
      const branchGroups = groups.filter((g) => g.branchId === b.id);
      const totalCapacity = branchRooms.reduce((sum, r) => sum + r.capacity, 0);
      return { branch: b, rooms: branchRooms, staff: branchStaff, students: branchStudents, groups: branchGroups, capacity: totalCapacity };
    });
  }, [branches, rooms, staff, students, groups]);

  return (
    <>
      <PageHeader title={t("branches.title")} description={t("branches.subtitle")} />
      <div className="space-y-6 p-4 md:p-8">
        {stats.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">{t("branches.empty")}</Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {stats.map(({ branch, rooms: brs, staff: bst, students: bstud, groups: bgr, capacity }) => (
              <Card key={branch.id} className="overflow-hidden p-0 shadow-elegant">
                <div className="bg-gradient-primary p-5 text-primary-foreground">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-5" />
                        <h3 className="truncate text-lg font-semibold">{branch.name}</h3>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-sm opacity-90">
                        <MapPin className="size-3.5" />
                        <span className="truncate">{branch.address}</span>
                      </div>
                    </div>
                    <Badge className="bg-white/20 text-primary-foreground hover:bg-white/30">{brs.length} {t("branches.rooms").toLowerCase()}</Badge>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 border-b border-border/60 p-4">
                  <Mini icon={Users} value={`${bstud.length}`} label={t("branches.col.students")} />
                  <Mini icon={Layers} value={`${bgr.length}`} label={t("branches.col.groups")} />
                  <Mini icon={DoorOpen} value={`${capacity}`} label={t("branches.field.capacity")} />
                  <Mini icon={Users} value={`${bst.length}`} label={t("branches.col.staff")} />
                </div>

                <div className="p-4">
                  <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("branches.rooms")}</div>
                  {brs.length === 0 ? (
                    <div className="text-sm text-muted-foreground">{t("common.empty")}</div>
                  ) : (
                    <div className="space-y-2">
                      {brs.map((r) => {
                        const used = bgr.filter((g) => g.roomId === r.id).length;
                        return (
                          <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              <div className="flex size-7 items-center justify-center rounded-md bg-accent text-primary">
                                <DoorOpen className="size-3.5" />
                              </div>
                              <span className="font-medium">{r.name}</span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              <span>{r.capacity} {t("branches.field.capacity").toLowerCase()}</span>
                              <Badge variant="outline" className="text-[10px]">{used} {t("branches.col.groups").toLowerCase()}</Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Mini({ icon: Icon, value, label }: { icon: typeof Users; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <div className="text-base font-bold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}
