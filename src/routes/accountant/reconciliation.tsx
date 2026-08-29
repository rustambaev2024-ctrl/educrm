import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, FileSpreadsheet, FileText, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/edu/page-shell";
import { DateInput, todayIso } from "@/components/edu/date-input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { analyticsApi } from "@/lib/api";
import { apiErrorMessage, useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accountant/reconciliation")({
  component: AccountantReconciliation,
});

/**
 * Триггерит настоящее скачивание файла браузером через временный <a download>.
 * URL.revokeObjectURL сразу после click() рвёт скачивание в части браузеров
 * (особенно Safari) — клик успевает стартовать сетевую/сохраняющую операцию
 * не синхронно, поэтому отзыв объекта отложен на короткий таймаут.
 */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AccountantReconciliation() {
  const { lang } = useI18n();
  const tr = (uz: string, ru: string) => (lang === "uz" ? uz : ru);
  const { students, isLoading } = useData();

  // ---------------------------------------------------------------------
  // Выбор ученика — комбобокс поверх Popover + Command, первый в проекте:
  // список учеников институтский и может быть большим, обычный Select
  // (без поиска) для него не подходит.
  // ---------------------------------------------------------------------
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const selectedStudent = useMemo(
    () => students.find((s) => s.id === studentId) ?? null,
    [students, studentId],
  );

  // ---------------------------------------------------------------------
  // Диапазон дат.
  // ---------------------------------------------------------------------
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canDownload = Boolean(studentId && dateFrom && dateTo);

  // Независимые лоадеры — скачивание PDF не должно блокировать кнопку Excel и наоборот.
  const [pdfLoading, setPdfLoading] = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);

  const download = async (format: "pdf" | "excel") => {
    if (!canDownload) return;
    const setLoading = format === "pdf" ? setPdfLoading : setExcelLoading;
    setLoading(true);
    try {
      const { blob, filename } = await analyticsApi.reconciliation(studentId, {
        date_from: dateFrom,
        date_to: dateTo,
        format,
      });
      saveBlob(blob, filename);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageShell
      title={tr("Solishtiruv akti", "Акт сверки")}
      subtitle={tr(
        "O'quvchi bo'yicha davr uchun solishtiruv aktini yuklab olish",
        "Скачать акт сверки взаиморасчётов по ученику за период",
      )}
    >
      <Card className="overflow-hidden shadow-elegant">
        <div className="border-b border-border/60 p-4 text-sm font-semibold">
          {tr("Akt parametrlari", "Параметры акта")}
        </div>
        <div className="space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="reconciliation-student" className="text-xs">
              {tr("O'quvchi", "Ученик")} *
            </Label>
            <Popover open={studentPickerOpen} onOpenChange={setStudentPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="reconciliation-student"
                  variant="outline"
                  role="combobox"
                  aria-expanded={studentPickerOpen}
                  disabled={isLoading}
                  className="w-full justify-between font-normal sm:w-80"
                >
                  <span className={cn("truncate", !selectedStudent && "text-muted-foreground")}>
                    {isLoading
                      ? tr("Yuklanmoqda...", "Загрузка...")
                      : selectedStudent
                        ? selectedStudent.fullName
                        : tr("O'quvchini tanlang", "Выберите ученика")}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0">
                <Command>
                  <CommandInput placeholder={tr("Ism bo'yicha qidirish...", "Поиск по имени...")} />
                  <CommandList>
                    {isLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        {tr("Yuklanmoqda...", "Загрузка...")}
                      </div>
                    ) : (
                      <>
                        <CommandEmpty>{tr("O'quvchi topilmadi", "Ученик не найден")}</CommandEmpty>
                        {students.map((s) => (
                          <CommandItem
                            key={s.id}
                            value={s.fullName}
                            onSelect={() => {
                              setStudentId(s.id);
                              setStudentPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "size-4",
                                s.id === studentId ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {s.fullName}
                          </CommandItem>
                        ))}
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="reconciliation-date-from" className="text-xs">
                {tr("Dan", "С")} *
              </Label>
              <DateInput
                id="reconciliation-date-from"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                maxDate={dateTo || todayIso()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reconciliation-date-to" className="text-xs">
                {tr("Gacha", "По")} *
              </Label>
              <DateInput
                id="reconciliation-date-to"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                minDate={dateFrom || undefined}
                maxDate={todayIso()}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={() => download("pdf")} disabled={!canDownload || pdfLoading}>
              <FileText className="size-4" />
              {pdfLoading ? "..." : tr("PDF yuklab olish", "Скачать PDF")}
            </Button>
            <Button
              variant="outline"
              onClick={() => download("excel")}
              disabled={!canDownload || excelLoading}
            >
              <FileSpreadsheet className="size-4" />
              {excelLoading ? "..." : tr("Excel yuklab olish", "Скачать Excel")}
            </Button>
          </div>

          {!canDownload && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ScrollText className="size-3.5" />
              {tr(
                "Yuklab olish uchun o'quvchi va sanalar oralig'ini tanlang",
                "Для скачивания выберите ученика и диапазон дат",
              )}
            </div>
          )}
        </div>
      </Card>
    </PageShell>
  );
}
