import { Link } from "@tanstack/react-router";
import {
    ArrowRight,
    ClockCounterClockwise,
    Sparkle,
    SquaresFour
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { useChat } from "../chat-context";
import { mockStarterPrompts, type Conversation } from "../mock-conversations";
import { ChatInput } from "./chat-input";

const blockStyles = {
    assistant: "mr-auto max-w-3xl border-white/10 bg-white/[0.05] text-white",
    user: "ml-auto max-w-2xl border-primary-50/25 bg-primary-50/10 text-primary-50",
    note: "mx-auto max-w-2xl border-dashed border-white/12 bg-black/20 text-dark-50"
} as const;

interface ConversationPlaceholderProps {
    conversation?: Conversation;
}

export function ConversationPlaceholder({
    conversation
}: ConversationPlaceholderProps) {
    const { conversations } = useChat();

    if (!conversation) {
        return (
            <section className="flex min-h-full items-center px-4 py-10 sm:px-6 lg:px-10">
                <div className="mx-auto w-full max-w-4xl rounded-[36px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_20px_80px_rgba(0,0,0,0.28)] sm:p-8">
                    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-dark-200">
                        <SquaresFour
                            className="size-4 text-primary-300"
                            weight="duotone"
                        />
                        Placeholder library
                    </div>

                    <h1 className="mt-6 max-w-2xl text-4xl font-semibold tracking-[-0.05em] text-white sm:text-5xl">
                        Pick a thread from the sidebar to preview the
                        conversation canvas.
                    </h1>

                    <p className="mt-4 max-w-2xl text-base leading-7 text-dark-100">
                        These routes are temporary UI scaffolding, isolated from
                        the backend so they can disappear once real thread data
                        lands.
                    </p>

                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                        {conversations.map((item) => (
                            <Link
                                key={item.id}
                                to="/conversations/$conversationId"
                                params={{ conversationId: item.id }}
                                className="group rounded-[24px] border border-white/8 bg-black/20 p-4 transition hover:border-white/16 hover:bg-white/[0.05]"
                            >
                                <div className="text-xs uppercase tracking-[0.24em] text-dark-300">
                                    {item.tag}
                                </div>
                                <h2 className="mt-3 text-lg font-medium text-white transition group-hover:text-primary-100">
                                    {item.title}
                                </h2>
                                <p className="mt-2 text-sm leading-6 text-dark-100">
                                    {item.summary}
                                </p>
                                <span className="mt-4 inline-flex items-center gap-2 text-sm text-primary-100">
                                    Open preview
                                    <ArrowRight
                                        className="size-4"
                                        weight="bold"
                                    />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
            <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col">
                <header className="rounded-[32px] border border-white/8 bg-white/[0.03] p-6 shadow-[0_16px_60px_rgba(0,0,0,0.2)] sm:p-7">
                    <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.24em] text-dark-200">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                            <Sparkle
                                className="size-4 text-primary-300"
                                weight="fill"
                            />
                            Conversation placeholder
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2">
                            <ClockCounterClockwise
                                className="size-4"
                                weight="bold"
                            />
                            {conversation.updatedAtLabel}
                        </span>
                    </div>

                    <h1 className="mt-5 text-3xl font-semibold tracking-[-0.05em] text-white sm:text-4xl">
                        {conversation.title}
                    </h1>

                    <p className="mt-3 max-w-3xl text-base leading-7 text-dark-100">
                        {conversation.summary}
                    </p>
                </header>

                <div className="mt-6 flex-1 space-y-4">
                    {conversation.blocks.map((block, index) => (
                        <article
                            key={`${conversation.id}-${index}`}
                            className={cn(
                                "rounded-[30px] border p-5 shadow-[0_18px_50px_rgba(0,0,0,0.18)]",
                                blockStyles[block.role]
                            )}
                        >
                            <div className="text-xs uppercase tracking-[0.26em] text-dark-200">
                                {block.eyebrow}
                            </div>
                            <p className="mt-3 text-[15px] leading-7 text-inherit">
                                {block.body}
                            </p>
                        </article>
                    ))}
                </div>

                <div className="mt-6 rounded-[32px] border border-dashed border-white/10 bg-black/20 p-4">
                    <div className="mb-4 flex flex-wrap gap-2">
                        {mockStarterPrompts.map((prompt) => (
                            <span
                                key={prompt}
                                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-dark-50"
                            >
                                {prompt}
                            </span>
                        ))}
                    </div>

                    <ChatInput placeholder="Reply, revise, or continue this placeholder conversation..." />
                </div>
            </div>
        </section>
    );
}
