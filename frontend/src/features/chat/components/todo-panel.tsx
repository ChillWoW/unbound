import { useState, useRef, useEffect, useLayoutEffect } from "react";
import {
    CaretDownIcon,
    CheckIcon,
    ListChecksIcon,
    SpinnerIcon,
    XIcon
} from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { TodoItem } from "../types";

function TodoItemRow({ todo }: { todo: TodoItem }) {
    const isCompleted = todo.status === "completed";
    const isCancelled = todo.status === "cancelled";
    const isInProgress = todo.status === "in_progress";
    const isPending = todo.status === "pending";

    return (
        <div className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors">
            <div className="shrink-0 max-h-5">
                {isCompleted ? (
                    <Checkbox
                        checked
                        className="pointer-events-none data-[checked]:bg-dark-700 data-[checked]:border-dark-600"
                        icon={
                            <CheckIcon
                                className="size-3 text-dark-100"
                                weight="bold"
                            />
                        }
                    />
                ) : isCancelled ? (
                    <Checkbox
                        checked
                        className="pointer-events-none data-[checked]:bg-dark-700 data-[checked]:border-dark-600"
                        icon={
                            <XIcon
                                className="size-3 text-dark-100"
                                weight="bold"
                            />
                        }
                    />
                ) : isInProgress ? (
                    <Checkbox
                        alwaysShowIcon
                        className="pointer-events-none"
                        icon={
                            <SpinnerIcon
                                className="size-3 animate-spin text-dark-100"
                                weight="bold"
                            />
                        }
                    />
                ) : (
                    <Checkbox className="pointer-events-none" />
                )}
            </div>

            <p
                className={cn(
                    "min-w-0 flex-1 text-xs leading-4 break-words transition-colors",
                    isCompleted && "line-through text-dark-200",
                    isCancelled && "line-through text-dark-200 italic",
                    isInProgress && "text-dark-100",
                    isPending && "text-dark-100"
                )}
            >
                {todo.content}
            </p>
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

    const [displayedCollapsedTodo, setDisplayedCollapsedTodo] = useState(
        currentTodo?.content ?? ""
    );
    const [todoTextPhase, setTodoTextPhase] = useState<"idle" | "out" | "in">(
        "idle"
    );

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

    useEffect(() => {
        if (expanded) return;

        const nextText = currentTodo?.content ?? "";

        if (nextText === displayedCollapsedTodo) return;

        setTodoTextPhase("out");

        const outTimer = setTimeout(() => {
            setDisplayedCollapsedTodo(nextText);
            setTodoTextPhase("in");
        }, 140);

        const inTimer = setTimeout(() => {
            setTodoTextPhase("idle");
        }, 280);

        return () => {
            clearTimeout(outTimer);
            clearTimeout(inTimer);
        };
    }, [currentTodo?.content, expanded, displayedCollapsedTodo]);

    return (
        <div>
            <button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-dark-700"
            >
                <ListChecksIcon
                    className="size-4 shrink-0 text-dark-200"
                    weight="bold"
                />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="text-xs font-medium text-dark-50">
                        {completedCount}/{totalCount} completed
                    </span>

                    <span
                        className={cn(
                            "min-w-0 overflow-hidden whitespace-nowrap truncate text-xs text-dark-200 transition-all duration-150",
                            expanded || !displayedCollapsedTodo
                                ? "max-w-0 opacity-0 -translate-y-1"
                                : "max-w-full opacity-100 translate-y-0",
                            todoTextPhase === "out" &&
                                "opacity-0 -translate-y-1",
                            todoTextPhase === "in" &&
                                "opacity-100 translate-y-0"
                        )}
                    >
                        - {displayedCollapsedTodo}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <div
                        className={cn(
                            "relative h-1 overflow-hidden rounded-full bg-dark-600 transition-all duration-250 ease-out",
                            expanded
                                ? "w-0 opacity-0 scale-x-75"
                                : "w-16 md:w-24 opacity-100 scale-x-100"
                        )}
                    >
                        <div
                            className="h-full rounded-full bg-primary-400 transition-[width] duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>

                    <CaretDownIcon
                        className={cn(
                            "size-4 text-dark-200 transition-transform duration-200",
                            expanded && "rotate-180"
                        )}
                        weight="bold"
                    />
                </div>
            </button>

            <div
                className="overflow-hidden transition-[height] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
                style={{ height: expanded ? measuredHeight : 0 }}
            >
                <div ref={expandedRef}>
                    <div className="h-0.5 w-full overflow-hidden rounded-full bg-dark-600">
                        <div
                            className="h-full rounded-full bg-primary-400 transition-all duration-500"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <div className="max-h-56 overflow-y-auto px-1.5 pb-1.5">
                        {todos.map((todo) => (
                            <TodoItemRow key={todo.id} todo={todo} />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
