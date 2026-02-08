'use client';

import { useState, useEffect, useRef } from 'react';
import { Power, MessageSquare, ShoppingBag, DollarSign, Send, User, Bot } from 'lucide-react';
import clsx from 'clsx';

interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export default function AdminDashboard() {
    const [isAiActive, setIsAiActive] = useState(true);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({ revenue: 0, pendingOrders: 0, activeChats: 0 });

    // Simulator State
    const [input, setInput] = useState("");
    const [chatHistory, setChatHistory] = useState<Message[]>([
        { role: 'assistant', content: "Ayubowan! Sera Auto ekata welcome. Mama Sera. Oyaata monawada one?" }
    ]);
    const [isSending, setIsSending] = useState(false);
    const chatBottomRef = useRef<HTMLDivElement>(null);

    // Fetch initial data
    useEffect(() => {
        // 1. Settings
        fetch('/api/settings')
            .then((res) => res.json())
            .then((data) => {
                if (data && typeof data.isAiActive !== 'undefined') {
                    setIsAiActive(data.isAiActive);
                }
            })
            .catch((err) => console.error(err));

        // 2. Stats
        fetch('/api/admin/stats')
            .then((res) => res.json())
            .then((data) => {
                if (data) setStats(data);
                setLoading(false);
            })
            .catch((err) => console.error(err));
    }, []);

    // Auto-scroll chat
    useEffect(() => {
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatHistory]);

    const toggleAI = async () => {
        const newState = !isAiActive;
        setIsAiActive(newState); // Optimistic update
        try {
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isAiActive: newState }),
            });
        } catch (error) {
            console.error("Failed to save state", error);
            setIsAiActive(!newState);
        }
    };

    const sendMessage = async () => {
        if (!input.trim() || isSending) return;

        const userMsg: Message = { role: 'user', content: input };
        setChatHistory(prev => [...prev, userMsg]);
        setInput("");
        setIsSending(true);

        try {
            // Simulate API Call
            const res = await fetch('/api/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Send recent history for context
                body: JSON.stringify({
                    message: userMsg.content,
                    history: chatHistory.slice(-6)
                }),
            });

            const data = await res.json();

            const botMsg: Message = {
                role: 'assistant',
                content: data.text || "Sorry, I am having trouble connecting."
            };

            setChatHistory(prev => [...prev, botMsg]);

        } catch (error) {
            setChatHistory(prev => [...prev, { role: 'system', content: "Error: Could not reach AI." }]);
        } finally {
            setIsSending(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 text-white font-sans p-4 lg:p-8 flex flex-col lg:flex-row gap-8">

            {/* LEFT COLUMN: Controls & Stats */}
            <div className="flex-1 space-y-8">
                {/* Header */}
                <header className="flex justify-between items-center bg-neutral-800 p-6 rounded-2xl border border-neutral-700">
                    <div>
                        <h1 className="text-3xl font-bold text-sky-400">Sera Control</h1>
                        <p className="text-neutral-400 text-sm">Business Dashboard</p>
                    </div>

                    <button
                        onClick={toggleAI}
                        className={clsx(
                            "flex items-center gap-2 px-5 py-3 rounded-full font-bold transition-all shadow-lg text-sm lg:text-base",
                            isAiActive
                                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                                : "bg-red-500 text-white hover:bg-red-600"
                        )}
                    >
                        <Power size={18} />
                        {isAiActive ? "AI ACTIVE" : "AWAY MODE"}
                    </button>
                </header>

                {/* KPI Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <StatCard title="Est. Revenue" value={`LKR ${stats.revenue.toLocaleString()}`} icon={<DollarSign className="text-emerald-400" />} />
                    <StatCard title="Active Chats (24h)" value={stats.activeChats.toString()} icon={<MessageSquare className="text-blue-400" />} />
                    <StatCard title="Pending Orders" value={stats.pendingOrders.toString()} icon={<ShoppingBag className="text-amber-400" />} />
                </div>

                {/* Logs / Monitor Logic could go here */}
                <div className="bg-neutral-800 rounded-2xl p-6 border border-neutral-700 h-[300px] overflow-hidden relative">
                    <h3 className="text-gray-400 text-sm uppercase font-bold mb-4 tracking-wider">Live System Logs</h3>
                    <div className="space-y-2 text-sm font-mono text-gray-300">
                        <p><span className="text-green-500">[System]</span> Dashboard Online.</p>
                        <p><span className="text-blue-500">[AI]</span> Connected to OpenAI GPT-4o.</p>
                        {!isAiActive && <p><span className="text-red-500">[ALERT]</span> AI paused by Admin.</p>}
                    </div>
                    {/* Gradient fade */}
                    <div className="absolute bottom-0 left-0 w-full h-24 bg-gradient-to-t from-neutral-800 to-transparent pointer-events-none"></div>
                </div>
            </div>

            {/* RIGHT COLUMN: Chat Simulator */}
            <div className="flex-1 bg-neutral-950 rounded-3xl border border-neutral-800 flex flex-col overflow-hidden shadow-2xl">
                <div className="bg-neutral-800 p-4 border-b border-neutral-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="font-semibold tracking-wide">TEST BOT SIMULATOR</span>
                    </div>
                    <span className="text-xs text-neutral-500 uppercase">Interactive Mode</span>
                </div>

                {/* Messages Area */}
                <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-neutral-900/50">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={clsx("flex gap-3", msg.role === 'user' ? "justify-end" : "justify-start")}>

                            {msg.role !== 'user' && (
                                <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center shrink-0">
                                    <Bot size={16} />
                                </div>
                            )}

                            <div className={clsx(
                                "max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed",
                                msg.role === 'user'
                                    ? "bg-blue-600 text-white rounded-tr-none"
                                    : "bg-neutral-800 text-gray-200 rounded-tl-none border border-neutral-700"
                            )}>
                                {msg.content}
                            </div>

                            {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center shrink-0">
                                    <User size={16} />
                                </div>
                            )}
                        </div>
                    ))}
                    {isSending && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center">
                                <Bot size={16} />
                            </div>
                            <div className="bg-neutral-800 p-4 rounded-2xl rounded-tl-none border border-neutral-700 flex gap-1 items-center">
                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></span>
                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-75"></span>
                                <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce delay-150"></span>
                            </div>
                        </div>
                    )}
                    <div ref={chatBottomRef}></div>
                </div>

                {/* Input Area */}
                <div className="p-4 bg-neutral-800 border-t border-neutral-700">
                    <div className="flex gap-2">
                        <input
                            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder-neutral-500"
                            placeholder="Type a message (e.g. 'brake pads for axio')..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            disabled={isSending}
                        />
                        <button
                            onClick={sendMessage}
                            disabled={isSending || !input.trim()}
                            className="bg-sky-500 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 rounded-xl transition-all flex items-center justify-center shadow-lg shadow-sky-500/20"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                    <p className="text-center text-xs text-neutral-500 mt-2">
                        Simulates a WhatsApp message from a generic user.
                    </p>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, icon }: { title: string, value: string, icon: any }) {
    return (
        <div className="bg-neutral-800 p-6 rounded-2xl border border-neutral-700 flex items-center justify-between hover:border-neutral-600 transition group cursor-default">
            <div>
                <p className="text-neutral-400 text-sm mb-1 group-hover:text-neutral-300 transition-colors">{title}</p>
                <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
            </div>
            <div className="p-3 bg-neutral-700 rounded-xl group-hover:bg-neutral-600 transition-colors">
                {icon}
            </div>
        </div>
    );
}
