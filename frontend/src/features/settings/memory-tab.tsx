import { useEffect, useMemo, useState } from "react";
import { BrainIcon } from "@phosphor-icons/react";
import { Button, Checkbox, Input, Switch } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { notify } from "@/lib/toast";
import { settingsApi } from "./api";
import type {
    MemoryConfidence,
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

const MEMORY_CONFIDENCE_LABELS: Record<MemoryConfidence, string> = {
    low: "Low",
    medium: "Medium",
    high: "High"
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
    if (!value) {
        return "Never";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

function MemoryBadge({ label }: { label: string }) {
    return (
        <span className="inline-flex items-center rounded-full border border-dark-600 bg-dark-800 px-2 py-0.5 text-[11px] font-medium text-dark-100">
            {label}
        </span>
    );
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
    const [confidenceFilter, setConfidenceFilter] = useState<
        MemoryConfidence | "all"
    >("all");
    const [memories, setMemories] = useState<UserMemorySummary[]>([]);
    const [isLoadingMemories, setIsLoadingMemories] = useState(false);
    const [memoryError, setMemoryError] = useState<string | null>(null);
    const [isSavingPolicy, setIsSavingPolicy] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    useEffect(() => {
        setDraft(settings);
    }, [settings]);

    useEffect(() => {
        if (!isActive) {
            return;
        }

        let cancelled = false;
        const timeoutId = window.setTimeout(() => {
            setIsLoadingMemories(true);
            setMemoryError(null);

            void settingsApi
                .listMemories({
                    query: searchQuery.trim() || undefined,
                    kind: kindFilter,
                    minConfidence: confidenceFilter,
                    limit: 50
                })
                .then((response) => {
                    if (!cancelled) {
                        setMemories(response.memories);
                    }
                })
                .catch((error) => {
                    if (!cancelled) {
                        setMemoryError(getErrorMessage(error));
                    }
                })
                .finally(() => {
                    if (!cancelled) {
                        setIsLoadingMemories(false);
                    }
                });
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [confidenceFilter, isActive, kindFilter, searchQuery]);

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
                title: "Memory settings updated",
                description: "Your memory policy was saved."
            });
        } catch (error) {
            notify.error({
                title: "Couldn't update memory settings",
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
            setMemories((current) =>
                current.filter((memory) => memory.id !== memoryId)
            );
            notify.success({
                title: "Memory deleted",
                description: "The selected memory has been removed."
            });
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
                <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-dark-800">
                        <BrainIcon className="size-5 text-dark-100" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-4">
                        <div>
                            <h2 className="text-sm font-semibold text-white">
                                Durable memory policy
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-dark-300">
                                Save only durable details that will help in future
                                conversations, like preferences and recurring
                                workflows.
                            </p>
                        </div>

                        <div className="rounded-md border border-dark-600 bg-dark-850 px-4 py-3">
                            <div className="flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-medium text-white">
                                        Enable memory
                                    </p>
                                    <p className="mt-1 text-xs text-dark-300">
                                        Allow the assistant to retrieve and write
                                        durable user memories through explicit memory
                                        tools.
                                    </p>
                                </div>
                                <Switch
                                    checked={draft.enabled}
                                    onCheckedChange={(checked) =>
                                        setDraft((current) => ({
                                            ...current,
                                            enabled: checked
                                        }))
                                    }
                                    aria-label="Enable memory"
                                />
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-[minmax(0,180px)_1fr]">
                            <label className="block text-sm">
                                <span className="mb-2 block font-medium text-white">
                                    Minimum confidence
                                </span>
                                <select
                                    value={draft.minConfidence}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            minConfidence: event.target
                                                .value as MemoryConfidence
                                        }))
                                    }
                                    className="w-full rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-dark-400"
                                    disabled={!draft.enabled}
                                >
                                    {(
                                        Object.entries(
                                            MEMORY_CONFIDENCE_LABELS
                                        ) as Array<[MemoryConfidence, string]>
                                    ).map(([value, label]) => (
                                        <option key={value} value={value}>
                                            {label}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className="block text-sm">
                                <span className="mb-2 block font-medium text-white">
                                    Policy note
                                </span>
                                <textarea
                                    value={draft.customInstructions ?? ""}
                                    onChange={(event) =>
                                        setDraft((current) => ({
                                            ...current,
                                            customInstructions: event.target.value
                                        }))
                                    }
                                    placeholder="Optional rule for memory writes, like 'prefer saving communication style and coding preferences only.'"
                                    rows={4}
                                    className="w-full rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-dark-300 focus:border-dark-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    disabled={!draft.enabled}
                                />
                            </label>
                        </div>

                        <div>
                            <p className="text-sm font-medium text-white">
                                Allowed memory kinds
                            </p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                {kindEntries.map(([kind, label]) => (
                                    <label
                                        key={kind}
                                        className="flex items-start gap-3 rounded-md border border-dark-600 bg-dark-850 px-4 py-3"
                                    >
                                        <Checkbox
                                            checked={draft.allowedKinds[kind]}
                                            onChange={(checked) =>
                                                setDraft((current) => ({
                                                    ...current,
                                                    allowedKinds: {
                                                        ...current.allowedKinds,
                                                        [kind]: checked
                                                    }
                                                }))
                                            }
                                            disabled={!draft.enabled}
                                        />
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium text-white">
                                                {label}
                                            </p>
                                            <p className="mt-1 text-xs leading-5 text-dark-300">
                                                {kind === "preference"
                                                    ? "Communication style, formatting, and tooling defaults."
                                                    : kind === "workflow"
                                                      ? "Recurring ways the user likes to work."
                                                      : kind === "profile"
                                                        ? "Useful non-sensitive background about the user."
                                                        : "Recurring product or team context that matters later."}
                                            </p>
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Button
                                type="button"
                                variant="primary"
                                onClick={handleSavePolicy}
                                disabled={isSavingPolicy}
                            >
                                {isSavingPolicy ? "Saving..." : "Save memory policy"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4">
                    <div>
                        <h2 className="text-sm font-semibold text-white">
                            Saved memories
                        </h2>
                        <p className="mt-1 text-sm leading-6 text-dark-300">
                            Review what the assistant remembers, why it was saved,
                            and remove anything you no longer want kept.
                        </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px]">
                        <Input
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            placeholder="Search saved memories"
                            disabled={isLoadingMemories}
                        />
                        <select
                            value={kindFilter}
                            onChange={(event) =>
                                setKindFilter(event.target.value as MemoryKind | "all")
                            }
                            className="rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-dark-400"
                            disabled={isLoadingMemories}
                        >
                            <option value="all">All kinds</option>
                            {kindEntries.map(([kind, label]) => (
                                <option key={kind} value={kind}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        <select
                            value={confidenceFilter}
                            onChange={(event) =>
                                setConfidenceFilter(
                                    event.target.value as MemoryConfidence | "all"
                                )
                            }
                            className="rounded-md border border-dark-600 bg-dark-800 px-3 py-2 text-sm text-white outline-none transition-colors focus:border-dark-400"
                            disabled={isLoadingMemories}
                        >
                            <option value="all">All confidence</option>
                            {(
                                Object.entries(MEMORY_CONFIDENCE_LABELS) as Array<
                                    [MemoryConfidence, string]
                                >
                            ).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {memoryError ? (
                        <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                            {memoryError}
                        </div>
                    ) : null}

                    {isLoadingMemories ? (
                        <p className="text-sm text-dark-300">Loading memories...</p>
                    ) : memories.length === 0 ? (
                        <div className="rounded-md border border-dashed border-dark-600 bg-dark-850 px-4 py-8 text-center">
                            <p className="text-sm font-medium text-white">
                                No memories found
                            </p>
                            <p className="mt-2 text-sm text-dark-300">
                                Saved memories will appear here once the assistant
                                stores durable user preferences or workflow notes.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {memories.map((memory) => (
                                <div
                                    key={memory.id}
                                    className="rounded-md border border-dark-600 bg-dark-850 px-4 py-4"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <MemoryBadge
                                                    label={
                                                        MEMORY_KIND_LABELS[memory.kind]
                                                    }
                                                />
                                                <MemoryBadge
                                                    label={`${MEMORY_CONFIDENCE_LABELS[memory.confidence]} confidence`}
                                                />
                                                <MemoryBadge
                                                    label="Saved by assistant"
                                                />
                                            </div>

                                            <p className="text-sm leading-6 text-white">
                                                {memory.content}
                                            </p>

                                            <div className="space-y-1 text-xs text-dark-300">
                                                <p>
                                                    <span className="text-dark-100">
                                                        Why saved:
                                                    </span>{" "}
                                                    {memory.source.reason}
                                                </p>
                                                {memory.source.excerpt ? (
                                                    <p>
                                                        <span className="text-dark-100">
                                                            Source excerpt:
                                                        </span>{" "}
                                                        {memory.source.excerpt}
                                                    </p>
                                                ) : null}
                                                {memory.keywords.length > 0 ? (
                                                    <p>
                                                        <span className="text-dark-100">
                                                            Keywords:
                                                        </span>{" "}
                                                        {memory.keywords.join(", ")}
                                                    </p>
                                                ) : null}
                                                <p>
                                                    <span className="text-dark-100">
                                                        Updated:
                                                    </span>{" "}
                                                    {formatDate(memory.updatedAt)}
                                                    {memory.lastAccessedAt ? (
                                                        <>
                                                            {" "}
                                                            <span className="text-dark-100">
                                                                · Last used:
                                                            </span>{" "}
                                                            {formatDate(
                                                                memory.lastAccessedAt
                                                            )}
                                                        </>
                                                    ) : null}
                                                </p>
                                            </div>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                                void handleDeleteMemory(memory.id)
                                            }
                                            disabled={deletingId === memory.id}
                                        >
                                            {deletingId === memory.id
                                                ? "Deleting..."
                                                : "Delete"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
