import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Send, Users, MessageCircle, Megaphone } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useData } from "@/lib/data/store";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { formatTime } from "@/lib/format";
import { openChatSocket } from "@/lib/realtime";
import type { ChatThread } from "@/lib/data/types";

function relativeTime(iso: string, lang: "uz" | "ru"): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return formatTime(iso);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return lang === "uz" ? "Kecha" : "Вчера";
  }
  return d.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", { day: "2-digit", month: "short" });
}

function initialsOf(name: string) {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

function scopeIcon(scope: ChatThread["scope"]) {
  if (scope === "group") return Users;
  if (scope === "broadcast") return Megaphone;
  return MessageCircle;
}

/**
 * Reusable two-pane messenger.
 * - threadFilter: predicate to filter threads visible for the current user
 * - mobileMode: render single-pane (list OR thread) instead of split layout
 */
export function MessengerPanel({
  threadFilter,
  mobileMode = false,
}: {
  threadFilter?: (t: ChatThread) => boolean;
  mobileMode?: boolean;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { threads, messages, loadThreadMessages, sendMessage, receiveChatMessage, markThreadRead } = useData();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleThreads = useMemo(() => {
    let list = threadFilter ? threads.filter(threadFilter) : threads;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((th) => th.title.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [threads, threadFilter, search]);

  // Auto-select first thread on desktop
  useEffect(() => {
    if (!mobileMode && !selectedId && visibleThreads.length > 0) {
      setSelectedId(visibleThreads[0].id);
    }
  }, [mobileMode, selectedId, visibleThreads]);

  useEffect(() => {
    if (!selectedId) return;
    loadThreadMessages(selectedId);
    markThreadRead(selectedId);
  }, [loadThreadMessages, selectedId, markThreadRead]);

  useEffect(() => {
    if (!selectedId) return;
    const handle = openChatSocket(selectedId, {
      onMessage: (message) => receiveChatMessage(selectedId, message),
      onEdit: (message) => receiveChatMessage(selectedId, message),
      onDelete: (messageId) => {
        // Deletions are still reconciled by the next REST reload; live delete support is non-blocking.
        console.debug("[messenger] message deleted", messageId);
      },
    });
    return () => handle?.close();
  }, [receiveChatMessage, selectedId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  });

  const selected = visibleThreads.find((th) => th.id === selectedId) ?? null;
  const threadMessages = useMemo(
    () => messages.filter((m) => m.threadId === selectedId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, selectedId],
  );

  const handleSend = () => {
    if (!draft.trim() || !selected || !user) return;
    sendMessage(selected.id, "me", user.fullName, draft.trim());
    setDraft("");
  };

  const list = (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("msg.search")}
            className="pl-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {visibleThreads.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">{t("common.empty")}</div>
          )}
          {visibleThreads.map((th) => {
            const Icon = scopeIcon(th.scope);
            const active = selectedId === th.id;
            return (
              <button
                key={th.id}
                onClick={() => setSelectedId(th.id)}
                className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${
                  active ? "bg-accent" : "hover:bg-accent/40"
                }`}
              >
                <div className="relative">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                      {initialsOf(th.title)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-background bg-card">
                    <Icon className="size-2.5 text-muted-foreground" />
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-sm font-medium">{th.title}</div>
                    <div className="flex-shrink-0 text-[10px] text-muted-foreground">{relativeTime(th.lastMessageAt, lang)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs text-muted-foreground">
                      {messages.filter((m) => m.threadId === th.id).slice(-1)[0]?.text ?? t("msg.noMessages")}
                    </div>
                    {th.unread > 0 && (
                      <Badge className="h-4 min-w-4 justify-center bg-primary px-1 text-[10px] text-primary-foreground">
                        {th.unread}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  const thread = selected ? (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
        {mobileMode && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            ←
          </Button>
        )}
        <Avatar className="size-9">
          <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
            {initialsOf(selected.title)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{selected.title}</div>
          <div className="text-[11px] text-muted-foreground">{t(`msg.scope.${selected.scope}`)}</div>
        </div>
      </div>
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-4">
        {threadMessages.length === 0 && (
          <div className="py-10 text-center text-sm text-muted-foreground">{t("msg.noMessages")}</div>
        )}
        {threadMessages.map((m) => {
          const mine = m.authorId === "me" || m.authorName === user?.fullName;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                  mine
                    ? "rounded-br-sm bg-gradient-primary text-primary-foreground"
                    : "rounded-bl-sm bg-card"
                }`}
              >
                {!mine && selected.scope !== "direct" && (
                  <div className="mb-0.5 text-[11px] font-semibold text-primary">{m.authorName}</div>
                )}
                <div className="whitespace-pre-wrap break-words">{m.text}</div>
                <div className={`mt-1 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {formatTime(m.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-border/60 bg-background p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={t("msg.placeholder")}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  ) : (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-accent text-primary">
        <MessageCircle className="size-7" />
      </div>
      <div className="text-base font-semibold">{t("msg.empty.title")}</div>
      <p className="max-w-xs text-sm text-muted-foreground">{t("msg.empty.body")}</p>
    </div>
  );

  if (mobileMode) {
    return (
      <div className="flex h-[calc(100vh-8.5rem)] flex-col bg-background">
        {selected ? thread : list}
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-[320px_1fr] overflow-hidden rounded-xl border border-border/60 bg-card shadow-elegant">
      <div className="border-r border-border/60">{list}</div>
      <div>{thread}</div>
    </div>
  );
}
