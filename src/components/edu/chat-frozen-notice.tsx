import { MessageCircleOff } from "lucide-react";
import { Card } from "@/components/ui/card";

export function ChatFrozenNotice() {
  return (
    <div className="p-4 md:p-8">
      <Card className="mx-auto flex max-w-xl flex-col items-center gap-3 p-8 text-center shadow-elegant">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
          <MessageCircleOff className="size-7" />
        </div>
        <div className="text-lg font-semibold">Внутренний чат временно заморожен</div>
        <p className="text-sm text-muted-foreground">
          Мы скрыли этот раздел, пока доводим UX и стабильность сообщений до production-уровня.
        </p>
      </Card>
    </div>
  );
}
