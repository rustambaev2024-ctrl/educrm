import { API_BASE_URL, readAccessToken } from "@/lib/api";

type SocketHandle = {
  close: () => void;
  socket: WebSocket;
};

type JsonObject = Record<string, unknown>;

export function getWebSocketBaseUrl(): string {
  const explicit = import.meta.env.VITE_WS_BASE_URL;
  if (explicit) return String(explicit).replace(/\/+$/, "");

  const url = new URL(API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

export function openRealtimeSocket(
  path: string,
  onMessage: (payload: JsonObject) => void,
  onStatus?: (status: "open" | "closed" | "error") => void,
): SocketHandle | null {
  if (typeof window === "undefined" || typeof WebSocket === "undefined") return null;

  const token = readAccessToken();
  if (!token) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${getWebSocketBaseUrl()}${normalizedPath}?token=${encodeURIComponent(token)}`;
  const socket = new WebSocket(url);

  socket.onopen = () => onStatus?.("open");
  socket.onclose = () => onStatus?.("closed");
  socket.onerror = () => onStatus?.("error");
  socket.onmessage = (event) => {
    try {
      onMessage(JSON.parse(String(event.data)) as JsonObject);
    } catch (err) {
      console.warn("[realtime] invalid websocket payload", err);
    }
  };

  return {
    socket,
    close: () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close(1000);
      }
    },
  };
}

export function openNotificationSocket(
  handlers: {
    onNotification?: (notification: JsonObject) => void;
    onCount?: (count: number) => void;
  },
  onStatus?: (status: "open" | "closed" | "error") => void,
): SocketHandle | null {
  return openRealtimeSocket(
    "/ws/notifications/",
    (payload) => {
      if (payload.type === "notification.new" && payload.notification && typeof payload.notification === "object") {
        handlers.onNotification?.(payload.notification as JsonObject);
      }
      if (payload.type === "notification.count") {
        handlers.onCount?.(Number(payload.unread_count ?? 0));
      }
    },
    onStatus,
  );
}

export function openChatSocket(
  chatId: string,
  handlers: {
    onMessage?: (message: JsonObject) => void;
    onEdit?: (message: JsonObject) => void;
    onDelete?: (messageId: string) => void;
    onRead?: (payload: JsonObject) => void;
  },
  onStatus?: (status: "open" | "closed" | "error") => void,
): SocketHandle | null {
  return openRealtimeSocket(
    `/ws/chat/${chatId}/`,
    (payload) => {
      if (payload.type === "message.new" && payload.message && typeof payload.message === "object") {
        handlers.onMessage?.(payload.message as JsonObject);
      }
      if (payload.type === "message.edit" && payload.message && typeof payload.message === "object") {
        handlers.onEdit?.(payload.message as JsonObject);
      }
      if (payload.type === "message.delete") {
        handlers.onDelete?.(String(payload.message_id ?? ""));
      }
      if (payload.type === "message.read") {
        handlers.onRead?.(payload);
      }
    },
    onStatus,
  );
}
