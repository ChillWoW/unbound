import { useEffect, useMemo, useState } from "react";
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch
} from "@/components/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { settingsApi } from "./api";
import type {
    MemoryKind,
    MemorySettingsSummary,
    UpdateMemorySettingsInput,
    UserMemorySummary
} from "./types";

const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
    preference: "Preference",
    workflow: "Workflow",
    profile: "Profile",
    project_context: "Project"
};

function getErrorMessage(error: unknown): string {
    if (
        error instanceof ApiError &&
        typeof error.data === "object" &&
        error.data
    ) {
        const message = "message" in error.data ? error.data.message : null;
        if (typeof message === "string" && message.length > 0) {
            return message;
        }
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return "Something went wrong. Please try again.";
}

function formatDate(value: string | null): string {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

export function MemoryTab({
    settings,
    onSavePolicy,
    isActive
}: {
    settings: MemorySettingsSummary;
    onSavePolicy: (input: UpdateMemorySettingsInput) => Promise<void>;
    isActive: boolean;
}) {
    const [draft, setDraft] = useState<UpdateMemorySettingsInput>(settings);
    const [searchQuery, setSearchQuery] = useState("");
    const [kindFilter, setKindFilter] = useState<MemoryKind | "all">("all");
    const [memories, setMemories] = useState<UserMemorySummary[]>([]);
    const [isLoadingMemories, setIsLoadingMemories] = useState(false);
    const [memoryError, setMemoryError] = useState<string | null>(null);
    const [isSavingPolicy, setIsSavingPolicy] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        setDraft(settings);
    }, [settings]);

    useEffect(() => {
        if (!isActive) return;

        let cancelled = false;
        const timeoutId = window.setTimeout(() => {
            setIsLoadingMemories(true);
            setMemoryError(null);

            void settingsApi
                .listMemories({
                    query: searchQuery.trim() || undefined,
                    kind: kindFilter,
                    limit: 50
                })
                .then((response) => {
                    if (!cancelled) setMemories(response.memories);
                })
                .catch((error) => {
                    if (!cancelled) setMemoryError(getErrorMessage(error));
                })
                .finally(() => {
                    if (!cancelled) setIsLoadingMemories(false);
                });
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [isActive, kindFilter, searchQuery]);

    const kindEntries = useMemo(
        () => Object.entries(MEMORY_KIND_LABELS) as Array<[MemoryKind, string]>,
        []
    );

    async function handleSavePolicy() {
        setIsSavingPolicy(true);
        try {
            await onSavePolicy({
                ...draft,
                customInstructions: draft.customInstructions?.trim() || null
            });
            notify.success({
                title: "Memory settings saved"
            });
        } catch (error) {
            notify.error({
                title: "Couldn't save memory settings",
                description: getErrorMessage(error)
            });
        } finally {
            setIsSavingPolicy(false);
        }
    }

    async function handleDeleteMemory(memoryId: string) {
        setDeletingId(memoryId);
        try {
            await settingsApi.deleteMemory(memoryId);
            setMemories((current) => current.filter((m) => m.id !== memoryId));
            notify.success({ title: "Memory deleted" });
        } catch (error) {
            notify.error({
                title: "Couldn't delete memory",
                description: getErrorMessage(error)
            });
        } finally {
            setDeletingId(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-5 sm:px-6">
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <p className="text-sm font-medium text-white">
                                Enable memory
                            </p>
                            <p className="mt-0.5 text-xs text-dark-300">
                                Let the assistant remember things across
                                conversations.
                            </p>
                        </div>
                        <Switch
                            checked={draft.enabled}
                            onCheckedChange={(checked) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    enabled: checked
                                }))
                            }
                            aria-label="Enable memory"
                        />
                    </div>

                    <div className="border-t border-dark-600" />

                    <div className="space-y-2">
                        <p className="text-sm font-medium text-white">
                            Custom instructions
                        </p>
                        <p className="text-xs text-dark-200">
                            Tell the assistant what to focus on when saving
                            memories.
                        </p>
                        <textarea
                            value={draft.customInstructions ?? ""}
                            onChange={(e) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    customInstructions: e.target.value
                                }))
                            }
                            placeholder="e.g. Only save coding preferences and communication style."
                            rows={3}
                            disabled={!draft.enabled}
                            className="w-full resize-none rounded-md bg-dark-800 px-3 py-2 text-sm text-white outline-none placeholder:text-dark-300 focus:ring-1 focus:ring-dark-500 disabled:cursor-not-allowed disabled:opacity-40"
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={handleSavePolicy}
                            disabled={isSavingPolicy}
                        >
                            {isSavingPolicy ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Saved memories */}
            <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-5 sm:px-6">
                <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search memories..."
                            className="flex-1"
                        />
                        <Select
                            value={kindFilter}
                            onValueChange={(value) =>
                                setKindFilter(value as MemoryKind | "all")
                            }
                            disabled={isLoadingMemories}
                        >
                            <SelectTrigger className="w-36">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All types</SelectItem>
                                {kindEntries.map(([kind, label]) => (
                                    <SelectItem key={kind} value={kind}>
                                        {label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {memoryError ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {memoryError}
                        </div>
                    ) : null}

                    {isLoadingMemories ? (
                        <p className="py-4 text-center text-sm text-dark-300">
                            Loading...
                        </p>
                    ) : memories.length === 0 ? (
                        <div className="py-8 text-center">
                            <p className="text-sm text-dark-300">
                                No memories saved yet.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-dark-600">
                            {memories.map((memory) => (
                                <MemoryRow
                                    key={memory.id}
                                    memory={memory}
                                    onDelete={handleDeleteMemory}
                                    isDeleting={deletingId === memory.id}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function MemoryRow({
    memory,
    onDelete,
    isDeleting
}: {
    memory: UserMemorySummary;
    onDelete: (id: string) => void;
    isDeleting: boolean;
}) {
    return (
        <div className="flex items-start gap-3 py-3">
            <div className="min-w-0 flex-1">
                <p className="text-sm text-dark-50 leading-5">
                    {memory.content}
                </p>
                <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-[11px] text-dark-200">
                        {MEMORY_KIND_LABELS[memory.kind]}
                    </span>
                    {memory.updatedAt ? (
                        <>
                            <span className="text-[11px] text-dark-200">-</span>
                            <span className="text-[11px] text-dark-200">
                                {formatDate(memory.updatedAt)}
                            </span>
                        </>
                    ) : null}
                </div>
            </div>
            <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDelete(memory.id)}
                disabled={isDeleting}
                className="shrink-0 text-dark-200 hover:text-red-400 hover:bg-red-500/10"
            >
                {isDeleting ? "..." : "Delete"}
            </Button>
        </div>
    );
}
