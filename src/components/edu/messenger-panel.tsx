import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCheck,
  MessageCircle,
  MessageSquarePlus,
  Search,
  Send,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { useData } from "@/lib/data/store";
import { formatTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { openChatSocket } from "@/lib/realtime";
import type { ChatThread } from "@/lib/data/types";

type Contact = {
  id: string;
  userId: string;
  name: string;
  phone: string;
  role: "director" | "admin" | "teacher" | "student" | "parent";
};

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function relativeTime(iso: string, lang: "uz" | "ru") {
  const date = new Date(iso);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return formatTime(iso);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Kecha";
  return date.toLocaleDateString(lang === "uz" ? "uz-Latn" : "ru-RU", {
    day: "2-digit",
    month: "short",
  });
}

function roleLabel(role: Contact["role"] | string) {
  if (role === "director") return "Direktor";
  if (role === "admin") return "Admin";
  if (role === "teacher") return "O'qituvchi";
  if (role === "student") return "O'quvchi";
  if (role === "parent") return "Ota-ona";
  return "Foydalanuvchi";
}

function chatTone(scope: ChatThread["scope"]) {
  if (scope === "group") return "from-sky-500 to-cyan-400";
  if (scope === "broadcast") return "from-amber-500 to-orange-400";
  return "from-violet-500 to-indigo-500";
}

export function MessengerPanel({
  threadFilter,
  mobileMode = false,
}: {
  threadFilter?: (thread: ChatThread) => boolean;
  mobileMode?: boolean;
}) {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const {
    threads,
    messages,
    staff,
    students,
    parents,
    loadThreadMessages,
    startDirectChat,
    sendMessage,
    receiveChatMessage,
    markThreadRead,
  } = useData();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"chats" | "people">("chats");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visibleThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = threadFilter ? threads.filter(threadFilter) : threads;
    return [...base]
      .filter(
        (thread) =>
          !query ||
          thread.title.toLowerCase().includes(query) ||
          (thread.lastMessage ?? "").toLowerCase().includes(query),
      )
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [search, threadFilter, threads]);

  const contacts = useMemo<Contact[]>(() => {
    const rows: Contact[] = [];
    for (const member of staff) {
      if (!member.userId || member.userId === user?.id) continue;
      rows.push({
        id: member.id,
        userId: member.userId,
        name: member.fullName,
        phone: member.phone,
        role: member.role,
      });
    }
    for (const student of students) {
      if (!student.userId || student.userId === user?.id) continue;
      rows.push({
        id: student.id,
        userId: student.userId,
        name: student.fullName,
        phone: student.phone,
        role: "student",
      });
    }
    for (const parent of parents) {
      if (!parent.userId || parent.userId === user?.id) continue;
      rows.push({
        id: parent.id,
        userId: parent.userId,
        name: parent.fullName,
        phone: parent.phone,
        role: "parent",
      });
    }
    const query = search.trim().toLowerCase();
    return rows
      .filter((contact, index, list) => list.findIndex((item) => item.userId === contact.userId) === index)
      .filter((contact) => !query || contact.name.toLowerCase().includes(query) || contact.phone.includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [parents, search, staff, students, user?.id]);

  const selected =
    visibleThreads.find((thread) => thread.id === selectedId) ??
    threads.find((thread) => thread.id === selectedId) ??
    null;
  const selectedMessages = useMemo(
    () => messages.filter((message) => message.threadId === selectedId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages, selectedId],
  );

  useEffect(() => {
    if (!mobileMode && !selectedId && visibleThreads.length > 0) setSelectedId(visibleThreads[0].id);
  }, [mobileMode, selectedId, visibleThreads]);

  useEffect(() => {
    if (!selectedId) return;
    loadThreadMessages(selectedId);
    markThreadRead(selectedId);
  }, [loadThreadMessages, markThreadRead, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const handle = openChatSocket(selectedId, {
      onMessage: (message) => receiveChatMessage(selectedId, message),
      onEdit: (message) => receiveChatMessage(selectedId, message),
    });
    return () => handle?.close();
  }, [receiveChatMessage, selectedId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [selectedMessages.length, selectedId]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !selected || !user) return;
    sendMessage(selected.id, user.id, user.fullName, text);
    setDraft("");
  };

  const openDirect = async (contact: Contact) => {
    setStartingUserId(contact.userId);
    const chatId = await startDirectChat(contact.userId);
    setStartingUserId(null);
    if (chatId) {
      setSelectedId(chatId);
      setTab("chats");
    }
  };

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col border-r border-border/60 bg-card/95">
      <div className="space-y-3 border-b border-border/60 bg-background/80 p-3 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-bold tracking-tight">Xabarlar</div>
            <div className="text-xs text-muted-foreground">Tezkor aloqa markazi</div>
          </div>
          <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <MessageCircle className="size-5" />
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Chat, ism yoki telefon"
            className="h-11 rounded-2xl border-border/60 bg-muted/60 pl-9"
          />
        </div>
        <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}>
          <TabsList className="grid w-full grid-cols-2 rounded-2xl">
            <TabsTrigger value="chats">Chatlar</TabsTrigger>
            <TabsTrigger value="people">Kontaktlar</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {tab === "chats" ? (
          <div className="space-y-1 p-2">
            {visibleThreads.length === 0 && <EmptyList text="Hozircha faol chatlar yo'q" />}
            {visibleThreads.map((thread) => {
              const active = selectedId === thread.id;
              const lastMessage =
                thread.lastMessage ||
                messages.filter((message) => message.threadId === thread.id).slice(-1)[0]?.text ||
                t("msg.noMessages");
              return (
                <button
                  key={thread.id}
                  onClick={() => setSelectedId(thread.id)}
                  className={`group flex w-full items-center gap-3 rounded-3xl p-3 text-left transition-all ${
                    active ? "bg-primary/12 ring-1 ring-primary/20" : "hover:bg-accent/55"
                  }`}
                >
                  <div className={`flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${chatTone(thread.scope)} text-sm font-bold text-white shadow-sm`}>
                    {thread.scope === "group" ? <Users className="size-5" /> : initialsOf(thread.title)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold">{thread.title}</div>
                      <div className="shrink-0 text-[10px] text-muted-foreground">{relativeTime(thread.lastMessageAt, lang)}</div>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <div className="truncate text-xs text-muted-foreground">{lastMessage}</div>
                      {thread.unread > 0 && <Badge className="h-5 min-w-5 justify-center rounded-full px-1.5 text-[10px]">{thread.unread}</Badge>}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {contacts.length === 0 && <EmptyList text="Kontaktlar topilmadi" />}
            {contacts.map((contact) => (
              <button
                key={contact.userId}
                onClick={() => openDirect(contact)}
                disabled={startingUserId === contact.userId}
                className="flex w-full items-center gap-3 rounded-3xl p-3 text-left transition hover:bg-accent/55 disabled:opacity-60"
              >
                <Avatar className="size-12 rounded-2xl">
                  <AvatarFallback className="rounded-2xl bg-muted text-sm font-semibold">{initialsOf(contact.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{contact.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {roleLabel(contact.role)} · {contact.phone}
                  </div>
                </div>
                <MessageSquarePlus className="size-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  const conversation = selected ? (
    <div className="flex h-full min-h-0 flex-col bg-[radial-gradient(circle_at_15%_10%,hsl(var(--primary)/0.10),transparent_28%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)/0.45))]">
      <div className="flex items-center gap-3 border-b border-border/60 bg-card/90 px-3 py-3 backdrop-blur-xl md:px-5">
        {mobileMode && (
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)} className="rounded-full">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className={`flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br ${chatTone(selected.scope)} text-sm font-bold text-white`}>
          {selected.scope === "group" ? <Users className="size-5" /> : initialsOf(selected.title)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{selected.title}</div>
          <div className="text-xs text-muted-foreground">{selected.scope === "group" ? "Guruh suhbati" : "Shaxsiy suhbat"}</div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 md:p-6">
        {selectedMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <Card className="max-w-sm p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Send className="size-5" />
              </div>
              <div className="font-semibold">Suhbatni boshlang</div>
              <div className="mt-1 text-sm text-muted-foreground">Yuborilgan birinchi xabar shu yerda ko'rinadi.</div>
            </Card>
          </div>
        )}
        {selectedMessages.map((message) => {
          const mine = message.authorId === user?.id || message.authorName === user?.fullName;
          return (
            <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[86%] rounded-[22px] px-4 py-2.5 text-sm shadow-sm md:max-w-[66%] ${mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border border-border/50 bg-card/95"}`}>
                {!mine && selected.scope === "group" && <div className="mb-1 text-[11px] font-semibold text-primary">{message.authorName}</div>}
                <div className="whitespace-pre-wrap break-words">{message.isDeleted ? "Xabar o'chirilgan" : message.text}</div>
                <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  <span>{formatTime(message.createdAt)}</span>
                  {message.isEdited && <span>edited</span>}
                  {mine && <CheckCheck className="size-3" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border/60 bg-card/90 p-3 backdrop-blur-xl md:p-4">
        <div className="flex items-end gap-2 rounded-3xl border border-border/70 bg-background p-2 shadow-sm">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Xabar yozing..."
            className="min-h-11 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
          <Button onClick={handleSend} disabled={!draft.trim()} size="icon" className="size-11 rounded-2xl">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex h-full items-center justify-center bg-muted/25 p-6">
      <Card className="max-w-sm p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-3xl bg-primary/15 text-primary">
          <MessageCircle className="size-8" />
        </div>
        <div className="text-lg font-bold">Chatni tanlang</div>
        <div className="mt-2 text-sm text-muted-foreground">Mavjud suhbatni oching yoki Kontaktlar bo'limidan yangisini boshlang.</div>
      </Card>
    </div>
  );

  if (mobileMode) {
    return <div className="h-[calc(100vh-8.25rem)] overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-elegant">{selected ? conversation : sidebar}</div>;
  }

  return (
    <div className="grid h-[calc(100vh-9rem)] grid-cols-[380px_minmax(0,1fr)] overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-elegant">
      {sidebar}
      {conversation}
    </div>
  );
}

function EmptyList({ text }: { text: string }) {
  return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}


