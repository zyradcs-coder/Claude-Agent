"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import type { ConversationWithLastMessage, Message, Profile, InternalNote } from "@/lib/types";

const STATUS_TABS = ["open", "pending", "closed", "all"] as const;
type StatusTab = (typeof STATUS_TABS)[number];

export default function Dashboard() {
  // @supabase/ssr's browser client attaches the logged-in user's session
  // (from the auth cookie middleware.ts already verified) to every request,
  // so RLS policies scoped to the "authenticated" role pass.
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createBrowserClient(url, key);
  }, []);

  const [conversations, setConversations] = useState<ConversationWithLastMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusTab, setStatusTab] = useState<StatusTab>("open");

  const [agents, setAgents] = useState<Profile[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [tab, setTab] = useState<"chat" | "notes">("chat");
  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [noteInput, setNoteInput] = useState("");

  const [viewers, setViewers] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId);
  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const agentLabel = (id: string | null) =>
    id ? agentById.get(id)?.display_name || agentById.get(id)?.email || "Unassigned agent" : null;

  const visibleConversations = useMemo(
    () => (statusTab === "all" ? conversations : conversations.filter((c) => (c.status || "open") === statusTab)),
    [conversations, statusTab]
  );

  const fetchConversations = useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) {
      console.error("Failed to fetch conversations:", data.error || data);
      setConversations([]);
      return;
    }
    setConversations(data);
  }, []);

  const fetchMessages = useCallback(async (convoId: string) => {
    const res = await fetch(`/api/conversations/${convoId}/messages`);
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) {
      console.error("Failed to fetch messages:", data.error || data);
      setMessages([]);
      return;
    }
    setMessages(data);
  }, []);

  const fetchNotes = useCallback(async (convoId: string) => {
    const res = await fetch(`/api/conversations/${convoId}/notes`);
    const data = await res.json();
    setNotes(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    fetchConversations();
    fetch("/api/agents")
      .then((r) => r.json())
      .then((d) => setAgents(Array.isArray(d) ? d : []));
    supabase?.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, [fetchConversations, supabase]);

  useEffect(() => {
    if (selectedId) {
      fetchMessages(selectedId);
      fetchNotes(selectedId);
      setTab("chat");
    }
  }, [selectedId, fetchMessages, fetchNotes]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime: new messages/conversation changes/notes
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("realtime-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const newMsg = payload.new as Message;
          if (newMsg.conversation_id === selectedId) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
          }
          fetchConversations();
        }
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () =>
        fetchConversations()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "internal_notes" },
        (payload) => {
          const newNote = payload.new as InternalNote;
          if (newNote.conversation_id === selectedId) {
            setNotes((prev) => (prev.some((n) => n.id === newNote.id) ? prev : [...prev, newNote]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
    };
  }, [selectedId, fetchConversations, supabase]);

  // Presence: who else is viewing this conversation right now
  useEffect(() => {
    if (!supabase || !selectedId || !currentUserId) return;
    const me = agentLabel(currentUserId) || "Agent";
    const channel = supabase.channel(`presence:conversation:${selectedId}`, {
      config: { presence: { key: currentUserId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ name: string }>();
        const names = Object.entries(state)
          .filter(([key]) => key !== currentUserId)
          .map(([, metas]) => metas[0]?.name)
          .filter(Boolean) as string[];
        setViewers(names);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: me });
        }
      });

    return () => {
      setViewers([]);
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, currentUserId, supabase, agents]);

  async function toggleMode() {
    if (!selected) return;
    const newMode = selected.mode === "agent" ? "human" : "agent";
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: newMode }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, mode: newMode } : c))
    );
  }

  async function updateStatus(status: "open" | "pending" | "closed") {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, status } : c)));
  }

  async function claimConversation() {
    if (!selected) return;
    const res = await fetch(`/api/conversations/${selected.id}/claim`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setConversations((prev) => prev.map((c) => (c.id === selected.id ? { ...c, ...data } : c)));
    }
  }

  async function assignAgent(agentId: string) {
    if (!selected) return;
    await fetch(`/api/conversations/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_agent_id: agentId || null }),
    });
    setConversations((prev) =>
      prev.map((c) => (c.id === selected.id ? { ...c, assigned_agent_id: agentId || null } : c))
    );
  }

  async function handleSend() {
    if (!input.trim() || !selectedId || sending) return;
    setSending(true);
    await fetch(`/api/conversations/${selectedId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input.trim() }),
    });
    setInput("");
    setSending(false);
    fetchMessages(selectedId);
  }

  async function handleAddNote() {
    if (!noteInput.trim() || !selectedId) return;
    const body = noteInput.trim();
    setNoteInput("");
    const res = await fetch(`/api/conversations/${selectedId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    const data = await res.json();
    if (res.ok) setNotes((prev) => (prev.some((n) => n.id === data.id) ? prev : [...prev, data]));
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function getInitials(name: string | null, phone: string) {
    if (name) return name.slice(0, 2).toUpperCase();
    return phone.slice(-2);
  }

  const STATUS_STYLE: Record<string, string> = {
    open: "bg-emerald-500/20 text-emerald-400",
    pending: "bg-amber-500/20 text-amber-400",
    closed: "bg-white/10 text-white/40",
  };

  return (
    <div className="flex h-screen bg-[#0f0f0f] font-sans">
      {/* Sidebar */}
      <div className="w-[320px] flex flex-col border-r border-white/[0.06]" style={{ background: "#141414" }}>
        {/* Sidebar Header */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-white leading-tight">Shared Inbox</h1>
              <p className="text-xs text-white/40 leading-tight mt-0.5">{visibleConversations.length} conversation{visibleConversations.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <Link href="/pipelines" className="text-[11px] text-white/40 hover:text-emerald-400 mt-2 inline-block">
            Pipelines →
          </Link>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 px-3 py-2 border-b border-white/[0.06]">
          {STATUS_TABS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusTab(s)}
              className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-medium uppercase tracking-wide transition-colors ${
                statusTab === s ? "bg-emerald-500/20 text-emerald-400" : "text-white/40 hover:text-white/70"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {visibleConversations.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
              <p className="text-xs text-white/30">No conversations here</p>
            </div>
          )}
          {visibleConversations.map((convo) => {
            const isSelected = selectedId === convo.id;
            return (
              <button
                key={convo.id}
                onClick={() => setSelectedId(convo.id)}
                className={`w-full text-left px-4 py-3.5 transition-all duration-150 relative group ${
                  isSelected ? "bg-white/[0.07]" : "hover:bg-white/[0.04]"
                }`}
              >
                {isSelected && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-8 bg-emerald-500 rounded-r" />
                )}
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center flex-shrink-0 text-white text-xs font-semibold">
                    {getInitials(convo.name, convo.phone)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-white/90 truncate">
                        {convo.name || convo.phone}
                      </span>
                      <span className="text-[10px] text-white/30 flex-shrink-0">
                        {formatTime(convo.updated_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      {convo.last_message ? (
                        <p className="text-xs text-white/40 truncate">{convo.last_message}</p>
                      ) : (
                        <span />
                      )}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${STATUS_STYLE[convo.status || "open"]}`}
                        >
                          {convo.status || "open"}
                        </span>
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wide ${
                            convo.mode === "agent"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {convo.mode === "agent" ? "AI" : "You"}
                        </span>
                      </div>
                    </div>
                    {convo.assigned_agent_id && (
                      <p className="text-[10px] text-white/25 mt-1 truncate">→ {agentLabel(convo.assigned_agent_id)}</p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-white/40">Select a conversation</p>
              <p className="text-xs text-white/20 mt-1">Choose from the list to start chatting</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="border-b border-white/[0.06]" style={{ background: "#141414" }}>
              <div className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-600 to-emerald-800 flex items-center justify-center text-white text-xs font-semibold">
                    {getInitials(selected.name, selected.phone)}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-white leading-tight">
                      {selected.name || selected.phone}
                    </h2>
                    <p className="text-xs text-white/40 leading-tight mt-0.5">
                      {selected.phone}
                      {viewers.length > 0 && (
                        <span className="text-emerald-400 ml-2">· {viewers.join(", ")} viewing</span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={selected.status || "open"}
                    onChange={(e) => updateStatus(e.target.value as "open" | "pending" | "closed")}
                    className="text-xs rounded-lg px-2 py-1.5 bg-white/[0.06] text-white/80 border border-white/[0.08] focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="closed">Closed</option>
                  </select>
                  <select
                    value={selected.assigned_agent_id || ""}
                    onChange={(e) => assignAgent(e.target.value)}
                    className="text-xs rounded-lg px-2 py-1.5 bg-white/[0.06] text-white/80 border border-white/[0.08] focus:outline-none max-w-[130px]"
                  >
                    <option value="">Unassigned</option>
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.display_name || a.email}
                      </option>
                    ))}
                  </select>
                  {selected.assigned_agent_id !== currentUserId && (
                    <button
                      onClick={claimConversation}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/[0.08]"
                    >
                      Claim
                    </button>
                  )}
                  <button
                    onClick={toggleMode}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                      selected.mode === "agent"
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20"
                        : "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25 border border-amber-500/20"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${selected.mode === "agent" ? "bg-emerald-400" : "bg-amber-400"}`} />
                    {selected.mode === "agent" ? "AI Mode" : "Human Mode"}
                  </button>
                </div>
              </div>
              <div className="flex gap-4 px-6">
                <button
                  onClick={() => setTab("chat")}
                  className={`text-xs pb-2 border-b-2 transition-colors ${
                    tab === "chat" ? "border-emerald-500 text-white" : "border-transparent text-white/40 hover:text-white/70"
                  }`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setTab("notes")}
                  className={`text-xs pb-2 border-b-2 transition-colors ${
                    tab === "notes" ? "border-amber-500 text-white" : "border-transparent text-white/40 hover:text-white/70"
                  }`}
                >
                  Internal notes {notes.length > 0 && `(${notes.length})`}
                </button>
              </div>
            </div>

            {tab === "chat" ? (
              <>
                {/* Messages */}
                <div
                  className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
                  style={{
                    backgroundImage: "radial-gradient(circle at 20% 80%, rgba(16,185,129,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(16,185,129,0.02) 0%, transparent 50%)",
                  }}
                >
                  {messages.map((msg, i) => {
                    const isCustomer = msg.sender_type === "customer" || (!msg.sender_type && msg.role === "user");
                    const showTime = i === messages.length - 1 || messages[i + 1]?.role !== msg.role;
                    const senderLabel =
                      msg.sender_type === "agent"
                        ? agentLabel(msg.sender_id) || "Teammate"
                        : msg.sender_type === "system"
                          ? "AI"
                          : null;
                    return (
                      <div key={msg.id} className={`flex ${isCustomer ? "justify-start" : "justify-end"}`}>
                        <div className={`flex flex-col ${isCustomer ? "items-start" : "items-end"} max-w-[65%]`}>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                              isCustomer
                                ? "bg-white/[0.07] text-white/90 rounded-tl-sm border border-white/[0.06]"
                                : msg.sender_type === "agent"
                                  ? "bg-sky-600 text-white rounded-tr-sm"
                                  : "bg-emerald-600 text-white rounded-tr-sm"
                            }`}
                          >
                            <p className="whitespace-pre-wrap">{msg.content}</p>
                          </div>
                          {showTime && (
                            <p className="text-[10px] text-white/25 mt-1.5 px-1">
                              {senderLabel && <span className="text-emerald-500/60 mr-1">{senderLabel} ·</span>}
                              {formatTime(msg.created_at)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Bar */}
                <div className="px-6 py-4 border-t border-white/[0.06]" style={{ background: "#141414" }}>
                  <div className="flex items-center gap-3 bg-white/[0.06] rounded-xl px-4 py-2.5 border border-white/[0.06] focus-within:border-emerald-500/40 transition-colors">
                    <input
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      placeholder="Type a message..."
                      className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !input.trim()}
                      className="w-8 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center flex-shrink-0"
                      aria-label="Send"
                    >
                      {sending ? (
                        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                        </svg>
                      ) : (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Internal Notes - never sent to the customer */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3" style={{ background: "#1a1608" }}>
                  {notes.length === 0 && (
                    <p className="text-xs text-white/30 text-center mt-8">No internal notes yet. Only your team sees these.</p>
                  )}
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-2.5">
                      <p className="text-sm text-amber-100 whitespace-pre-wrap">{note.body}</p>
                      <p className="text-[10px] text-amber-400/60 mt-1.5">
                        {agentLabel(note.agent_id) || "Teammate"} · {formatTime(note.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="px-6 py-4 border-t border-white/[0.06]" style={{ background: "#141414" }}>
                  <div className="flex items-center gap-3 bg-amber-500/[0.06] rounded-xl px-4 py-2.5 border border-amber-500/20 focus-within:border-amber-500/40 transition-colors">
                    <input
                      type="text"
                      value={noteInput}
                      onChange={(e) => setNoteInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleAddNote()}
                      placeholder="Add an internal note (teammates only)..."
                      className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={!noteInput.trim()}
                      className="w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-150 flex items-center justify-center flex-shrink-0"
                      aria-label="Add note"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
