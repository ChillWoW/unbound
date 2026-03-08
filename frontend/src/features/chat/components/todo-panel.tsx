import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
    CaretDownIcon,
    CaretUpIcon,
    CheckCircleIcon,
    ListChecksIcon,
    SpinnerIcon,
    XCircleIcon
} from "@phosphor-icons/react";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TodoItem } from "../types";

const PRIORITY_STYLES: Record<string, { dot: string; label: string }> = {
    high: { dot: "bg-red-400", label: "High" },
    medium: { dot: "bg-amber-400", label: "Medium" },
    low: { dot: "bg-dark-400", label: "Low" }
};

function TodoItemRow({ todo }: { todo: TodoItem }) {
    const isCompleted = todo.status === "completed";
    const isCancelled = todo.status === "cancelled";
    const isDone = isCompleted || isCancelled;
    const priority = PRIORITY_STYLES[todo.priority] ?? PRIORITY_STYLES.medium;
    return (
        <div
            className={cn(
                "flex items-start gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
                isDone && "opacity-50"
            )}
        >
            <div className="mt-0.5 shrink-0">
                {todo.status === "completed" ? (
                    <div className="flex size-4 items-center justify-center rounded-[3px] bg-emerald-500/90">
                        <CheckCircleIcon
                            className="size-3 text-white"
                            weight="bold"
                        />
                    </div>
                ) : todo.status === "cancelled" ? (
                    <div className="flex size-4 items-center justify-center rounded-[3px] border border-dark-500 bg-dark-700">
                        <XCircleIcon
                            className="size-3 text-dark-400"
                            weight="bold"
                        />
                    </div>
                ) : todo.status === "in_progress" ? (
                    <div className="flex size-4 items-center justify-center rounded-[3px] border border-blue-400/50 bg-blue-500/10">
                        <SpinnerIcon
                            className="size-3 animate-spin text-blue-400"
                            weight="bold"
                        />
                    </div>
                ) : (
                    <div className="size-4 rounded-[3px] border border-dark-500 bg-dark-700" />
                )}
            </div>

            <div className="min-w-0 flex-1">
                <p
                    className={cn(
                        "text-[13px] leading-5 break-words",
                        isCompleted && "line-through text-dark-400",
                        isCancelled && "line-through text-dark-500",
                        todo.status === "in_progress" && "text-dark-50",
                        todo.status === "pending" && "text-dark-200"
                    )}
                >
                    {todo.content}
                </p>

                <div className="mt-0.5 flex items-center gap-2">
                    {todo.priority !== "low" && !isDone && (
                        <Tooltip content={priority.label} side="bottom">
                            <span className="flex items-center gap-1">
                                <span
                                    className={cn(
                                        "inline-block size-1.5 rounded-full",
                                        priority.dot
                                    )}
                                />
                                <span className="text-[10px] text-dark-400">
                                    {priority.label}
                                </span>
                            </span>
                        </Tooltip>
                    )}

                    {todo.status === "in_progress" && (
                        <span className="flex items-center gap-1">
                            <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-blue-400" />
                            </span>
                            <span className="text-[10px] text-blue-400">
                                In progress
                            </span>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}

interface TodoPanelProps {
    todos: TodoItem[];
}

export function TodoPanel({ todos }: TodoPanelProps) {
    const [expanded, setExpanded] = useState(false);
    const [measuredHeight, setMeasuredHeight] = useState(0);
    const expandedRef = useRef<HTMLDivElement>(null);

    if (todos.length === 0) return null;

    const activeTodos = todos.filter(
        (t) => t.status === "pending" || t.status === "in_progress"
    );
    const doneTodos = todos.filter(
        (t) => t.status === "completed" || t.status === "cancelled"
    );
    const completedCount = doneTodos.filter(
        (t) => t.status === "completed"
    ).length;
    const totalCount = todos.length;
    const progressPercent =
        totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

    const currentTodo =
        activeTodos.find((t) => t.status === "in_progress") ?? activeTodos[0];

    useLayoutEffect(() => {
        if (!expandedRef.current) return;
        setMeasuredHeight(expandedRef.current.scrollHeight);
    }, [todos, expanded]);

    useEffect(() => {
        if (!expandedRef.current) return;
        const ro = new ResizeObserver(() => {
            if (expandedRef.current) {
                setMeasuredHeight(expandedRef.current.scrollHeight);
            }
        });
        ro.observe(expandedRef.current);
        return () => ro.disconnect();
    }, []);

    return (
        <div className="border-b border-dark-600">
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-dark-700/50"
            >
                <ListChecksIcon
                    className="size-4 shrink-0 text-dark-300"
                    weight="bold"
                />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-xs font-medium text-dark-100">
                        {completedCount}/{totalCount} completed
                    </span>

                    {!expanded && currentTodo && (
                        <>
                            <span className="text-dark-500">&middot;</span>
                            <span className="truncate text-xs text-dark-300">
                                {currentTodo.content}
                            </span>
                        </>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {!expanded && (
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-dark-600">
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    )}

                    {expanded ? (
                        <CaretUpIcon
                            className="size-3.5 text-dark-400"
                            weight="bold"
                        />
                    ) : (
                        <CaretDownIcon
                            className="size-3.5 text-dark-400"
                            weight="bold"
                        />
                    )}
                </div>
            </button>

            <div
                className="overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ height: expanded ? measuredHeight : 0 }}
            >
                <div ref={expandedRef}>
                    <div className="max-h-56 overflow-y-auto scrollbar-custom px-1.5 pb-1.5">
                        {activeTodos.length > 0 && (
                            <div>
                                {activeTodos.map((todo) => (
                                    <TodoItemRow key={todo.id} todo={todo} />
                                ))}
                            </div>
                        )}

                        {doneTodos.length > 0 && activeTodos.length > 0 && (
                            <div className="mx-2.5 my-1 border-t border-dark-600/50" />
                        )}

                        {doneTodos.length > 0 && (
                            <div>
                                {doneTodos.map((todo) => (
                                    <TodoItemRow key={todo.id} todo={todo} />
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="px-3.5 pb-2.5 pt-1">
                        <div className="h-1 w-full overflow-hidden rounded-full bg-dark-600">
                            <div
                                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
