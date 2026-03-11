import { useEffect, useMemo, useState } from "react";
import {
    ArrowsClockwiseIcon,
    CheckCircleIcon,
    GlobeIcon,
    PencilSimpleIcon,
    PlugChargingIcon,
    PlusIcon,
    ShieldCheckIcon,
    TrashIcon,
    WarningCircleIcon,
    WrenchIcon
} from "@phosphor-icons/react";
import {
    Button,
    Checkbox,
    Input,
    Modal,
    ModalContent,
    ModalDescription,
    ModalTitle,
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
    McpAuthMode,
    UpdateMcpServerInput,
    UserMcpServerSummary
} from "./types";

type McpFormState = UpdateMcpServerInput;

const DEFAULT_FORM_STATE: McpFormState = {
    name: "",
    url: "",
    authMode: "none",
    authHeaderName: "",
    authToken: "",
    keepExistingAuthToken: false,
    enabled: true,
    toolPrefix: "",
    allowAllTools: true,
    allowedTools: []
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
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";
    return date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function statusTone(status: UserMcpServerSummary["lastHealthStatus"]) {
    if (status === "healthy") {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    }

    if (status === "error") {
        return "border-red-500/30 bg-red-500/10 text-red-200";
    }

    return "border-dark-600 bg-dark-800 text-dark-200";
}

function buildFormState(server: UserMcpServerSummary | null): McpFormState {
    if (!server) {
        return DEFAULT_FORM_STATE;
    }

    return {
        name: server.name,
        url: server.url,
        authMode: server.authMode,
        authHeaderName: server.authHeaderName ?? "",
        authToken: "",
        keepExistingAuthToken: server.hasAuthToken,
        enabled: server.enabled,
        toolPrefix: server.toolPrefix,
        allowAllTools: server.allowAllTools,
        allowedTools: server.allowedTools
    };
}

export function McpTab({ isActive }: { isActive: boolean }) {
    const [servers, setServers] = useState<UserMcpServerSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingServer, setEditingServer] =
        useState<UserMcpServerSummary | null>(null);
    const [form, setForm] = useState<McpFormState>(DEFAULT_FORM_STATE);
    const [isSaving, setIsSaving] = useState(false);
    const [busyServerId, setBusyServerId] = useState<string | null>(null);
    const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

    async function loadServers() {
        setIsLoading(true);
        setError(null);

        try {
            const response = await settingsApi.listMcpServers();
            setServers(response.servers);
            setHasLoadedOnce(true);
        } catch (loadError) {
            setError(getErrorMessage(loadError));
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        if (!isActive || hasLoadedOnce) {
            return;
        }

        void loadServers();
    }, [hasLoadedOnce, isActive]);

    const discoveredToolOptions = useMemo(
        () => editingServer?.discoveredTools ?? [],
        [editingServer]
    );

    function upsertServer(server: UserMcpServerSummary) {
        setServers((current) => {
            const next = current.filter((item) => item.id !== server.id);
            return [server, ...next].sort(
                (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
            );
        });
    }

    function openCreateModal() {
        setEditingServer(null);
        setForm(DEFAULT_FORM_STATE);
        setIsModalOpen(true);
    }

    function openEditModal(server: UserMcpServerSummary) {
        setEditingServer(server);
        setForm(buildFormState(server));
        setIsModalOpen(true);
    }

    function closeModal() {
        if (isSaving) return;
        setIsModalOpen(false);
        setEditingServer(null);
        setForm(DEFAULT_FORM_STATE);
    }

    function toggleAllowedTool(toolName: string, checked: boolean) {
        setForm((current) => ({
            ...current,
            allowedTools: checked
                ? [...current.allowedTools, toolName]
                : current.allowedTools.filter((name) => name !== toolName)
        }));
    }

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSaving(true);

        try {
            const payload: UpdateMcpServerInput = {
                ...form,
                name: form.name.trim(),
                url: form.url.trim(),
                authHeaderName: form.authHeaderName.trim(),
                authToken: form.authToken.trim(),
                toolPrefix: form.toolPrefix.trim(),
                allowedTools: form.allowAllTools ? [] : form.allowedTools
            };

            const response = editingServer
                ? await settingsApi.updateMcpServer(editingServer.id, payload)
                : await settingsApi.createMcpServer(payload);

            upsertServer(response.server);
            closeModal();
            notify.success({
                title: editingServer ? "MCP server updated" : "MCP server added"
            });
        } catch (saveError) {
            notify.error({
                title: editingServer
                    ? "Couldn't update MCP server"
                    : "Couldn't add MCP server",
                description: getErrorMessage(saveError)
            });
        } finally {
            setIsSaving(false);
        }
    }

    async function handleDelete(server: UserMcpServerSummary) {
        if (!window.confirm(`Delete MCP server "${server.name}"?`)) {
            return;
        }

        setBusyServerId(server.id);

        try {
            await settingsApi.deleteMcpServer(server.id);
            setServers((current) => current.filter((item) => item.id !== server.id));
            notify.success({ title: "MCP server deleted" });
        } catch (deleteError) {
            notify.error({
                title: "Couldn't delete MCP server",
                description: getErrorMessage(deleteError)
            });
        } finally {
            setBusyServerId(null);
        }
    }

    async function handleRefresh(
        server: UserMcpServerSummary,
        action: "test" | "discover"
    ) {
        setBusyServerId(server.id);

        try {
            const response =
                action === "test"
                    ? await settingsApi.testMcpServer(server.id)
                    : await settingsApi.discoverMcpServer(server.id);

            upsertServer(response.server);
            notify.success({
                title:
                    action === "test"
                        ? "MCP connection successful"
                        : "MCP tools refreshed",
                description:
                    response.toolCount > 0
                        ? `${response.toolCount} tool${response.toolCount === 1 ? "" : "s"} discovered.`
                        : "No tools were exposed by this server."
            });
        } catch (refreshError) {
            notify.error({
                title:
                    action === "test"
                        ? "MCP connection failed"
                        : "Couldn't refresh MCP tools",
                description: getErrorMessage(refreshError)
            });
            void loadServers();
        } finally {
            setBusyServerId(null);
        }
    }

    async function handleToggleEnabled(server: UserMcpServerSummary, enabled: boolean) {
        setBusyServerId(server.id);

        try {
            const response = await settingsApi.updateMcpServer(server.id, {
                name: server.name,
                url: server.url,
                authMode: server.authMode,
                authHeaderName: server.authHeaderName ?? "",
                authToken: "",
                keepExistingAuthToken: server.hasAuthToken,
                enabled,
                toolPrefix: server.toolPrefix,
                allowAllTools: server.allowAllTools,
                allowedTools: server.allowedTools
            });

            upsertServer(response.server);
        } catch (toggleError) {
            notify.error({
                title: "Couldn't update MCP server",
                description: getErrorMessage(toggleError)
            });
        } finally {
            setBusyServerId(null);
        }
    }

    return (
        <>
            <div className="space-y-4">
                <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-5 sm:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="max-w-xl">
                            <p className="text-sm font-medium text-white">
                                Model Context Protocol servers
                            </p>
                            <p className="mt-0.5 text-xs text-dark-300">
                                Connect remote MCP servers, store connection data
                                encrypted, and choose which tools the assistant can use.
                            </p>
                        </div>

                        <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            onClick={openCreateModal}
                            className="shrink-0 whitespace-nowrap"
                        >
                            <PlusIcon className="size-4" />
                            Add server
                        </Button>
                    </div>
                </div>

                {error ? (
                    <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                        {error}
                    </div>
                ) : null}

                {isLoading ? (
                    <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-8 text-center text-sm text-dark-300">
                        Loading MCP servers...
                    </div>
                ) : servers.length === 0 ? (
                    <div className="rounded-md border border-dark-600 bg-dark-900 px-5 py-10 text-center">
                        <PlugChargingIcon className="mx-auto size-8 text-dark-300" />
                        <p className="mt-3 text-sm font-medium text-white">
                            No MCP servers configured yet.
                        </p>
                        <p className="mt-1 text-xs text-dark-300">
                            Add a remote MCP endpoint to make its tools available in chat.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-md border border-dark-600 bg-dark-900">
                        {servers.map((server, index) => {
                            const isBusy = busyServerId === server.id;

                            return (
                                <div
                                    key={server.id}
                                    className={index > 0 ? "border-t border-dark-600" : ""}
                                >
                                    <div className="px-5 py-4 sm:px-6">
                                        <div className="flex flex-col gap-3">
                                            {/* Header row */}
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0 space-y-1.5">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="text-sm font-medium text-white">
                                                            {server.name}
                                                        </p>
                                                        <span
                                                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusTone(server.lastHealthStatus)}`}
                                                        >
                                                            {server.lastHealthStatus}
                                                        </span>
                                                        <span className="inline-flex items-center rounded-full border border-dark-600 bg-dark-800 px-2 py-0.5 text-[11px] font-medium text-dark-200">
                                                            {server.toolPrefix}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-3 text-xs text-dark-300">
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <GlobeIcon className="size-3.5" />
                                                            {server.urlPreview}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1.5">
                                                            <ShieldCheckIcon className="size-3.5" />
                                                            {server.authMode === "none"
                                                                ? "No auth"
                                                                : server.authMode === "bearer"
                                                                  ? server.authTokenPreview ?? "Bearer token"
                                                                  : `${server.authHeaderName}: ${server.authTokenPreview ?? "configured"}`}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2">
                                                    <div className="flex items-center gap-2 text-xs text-dark-200">
                                                        <span>Enabled</span>
                                                        <Switch
                                                            checked={server.enabled}
                                                            onCheckedChange={(checked) =>
                                                                void handleToggleEnabled(server, checked)
                                                            }
                                                            disabled={isBusy}
                                                            aria-label={`Toggle ${server.name}`}
                                                        />
                                                    </div>

                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void handleRefresh(server, "test")}
                                                        disabled={isBusy}
                                                    >
                                                        <CheckCircleIcon className="size-4" />
                                                        Test
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => void handleRefresh(server, "discover")}
                                                        disabled={isBusy}
                                                    >
                                                        <ArrowsClockwiseIcon className="size-4" />
                                                        Refresh tools
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => openEditModal(server)}
                                                        disabled={isBusy}
                                                    >
                                                        <PencilSimpleIcon className="size-4" />
                                                        Edit
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => void handleDelete(server)}
                                                        disabled={isBusy}
                                                        className="text-red-300 hover:bg-red-500/10 hover:text-red-200"
                                                    >
                                                        <TrashIcon className="size-4" />
                                                        Delete
                                                    </Button>
                                                </div>
                                            </div>

                                            {/* Error */}
                                            {server.lastHealthError ? (
                                                <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                                                    <div className="inline-flex items-center gap-2 font-medium">
                                                        <WarningCircleIcon className="size-4" />
                                                        Connection issue
                                                    </div>
                                                    <p className="mt-1 text-xs leading-5">
                                                        {server.lastHealthError}
                                                    </p>
                                                </div>
                                            ) : null}

                                            {/* Stats */}
                                            <div className="flex flex-wrap gap-4 border-t border-dark-600 pt-3 text-xs text-dark-300">
                                                <div>
                                                    <span className="text-dark-200">Last checked</span>
                                                    <span className="ml-2 text-white">
                                                        {formatDate(server.lastConnectedAt)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-dark-200">Tools</span>
                                                    <span className="ml-2 text-white">
                                                        {server.discoveredTools.length} discovered
                                                        {!server.allowAllTools
                                                            ? `, ${server.allowedTools.length} allowed`
                                                            : ", all allowed"}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Tools list */}
                                            {server.discoveredTools.length > 0 ? (
                                                <div className="border-t border-dark-600 pt-3">
                                                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-dark-200">
                                                        <WrenchIcon className="size-3.5" />
                                                        Available tools
                                                    </div>
                                                    <div className="divide-y divide-dark-600">
                                                        {server.discoveredTools.map((toolInfo) => {
                                                            const isAllowed =
                                                                server.allowAllTools ||
                                                                server.allowedTools.includes(toolInfo.name);

                                                            return (
                                                                <div
                                                                    key={toolInfo.name}
                                                                    className="flex items-start justify-between gap-3 py-2"
                                                                >
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm text-white">
                                                                            {toolInfo.title ?? toolInfo.name}
                                                                        </p>
                                                                        {toolInfo.description ? (
                                                                            <p className="mt-0.5 text-xs leading-5 text-dark-300">
                                                                                {toolInfo.description}
                                                                            </p>
                                                                        ) : null}
                                                                    </div>
                                                                    <span className="shrink-0 text-xs text-dark-200">
                                                                        {isAllowed ? "Enabled" : "Blocked"}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <Modal open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
                <ModalContent className="max-w-2xl">
                    <div className="space-y-5 p-4 sm:p-5">
                        <div>
                            <ModalTitle>
                                {editingServer ? "Edit MCP server" : "Add MCP server"}
                            </ModalTitle>
                            <ModalDescription>
                                Remote MCP endpoints are stored per user and encrypted at
                                rest in the database.
                            </ModalDescription>
                        </div>

                        <form className="space-y-4" onSubmit={handleSubmit}>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Display name
                                    </label>
                                    <Input
                                        value={form.name}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                name: event.target.value
                                            }))
                                        }
                                        placeholder="e.g. GitHub MCP"
                                        disabled={isSaving}
                                        className="bg-dark-900"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Tool prefix
                                    </label>
                                    <Input
                                        value={form.toolPrefix}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                toolPrefix: event.target.value
                                            }))
                                        }
                                        placeholder="github"
                                        disabled={isSaving}
                                        className="bg-dark-900"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-white">
                                    Server URL
                                </label>
                                <Input
                                    value={form.url}
                                    onChange={(event) =>
                                        setForm((current) => ({
                                            ...current,
                                            url: event.target.value
                                        }))
                                    }
                                    placeholder="https://example.com/mcp"
                                    disabled={isSaving}
                                    leftSection={<GlobeIcon className="size-4" />}
                                    className="bg-dark-900"
                                />
                            </div>

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Authentication
                                    </label>
                                    <Select
                                        value={form.authMode}
                                        onValueChange={(value) =>
                                            setForm((current) => ({
                                                ...current,
                                                authMode: value as McpAuthMode,
                                                authHeaderName:
                                                    value === "header"
                                                        ? current.authHeaderName
                                                        : ""
                                            }))
                                        }
                                        disabled={isSaving}
                                    >
                                        <SelectTrigger className="bg-dark-900 hover:bg-dark-800">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No auth</SelectItem>
                                            <SelectItem value="bearer">Bearer token</SelectItem>
                                            <SelectItem value="header">Custom header</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Enabled
                                    </label>
                                    <div className="flex h-9 items-center gap-3">
                                        <Switch
                                            checked={form.enabled}
                                            onCheckedChange={(checked) =>
                                                setForm((current) => ({
                                                    ...current,
                                                    enabled: checked
                                                }))
                                            }
                                            disabled={isSaving}
                                            aria-label="Enable MCP server"
                                        />
                                        <span className="text-sm text-dark-200">
                                            Allow this server in chat
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {form.authMode === "header" ? (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Header name
                                    </label>
                                    <Input
                                        value={form.authHeaderName}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                authHeaderName: event.target.value
                                            }))
                                        }
                                        placeholder="x_context7_api_key"
                                        disabled={isSaving}
                                        className="bg-dark-900"
                                    />
                                    <p className="text-xs text-dark-300">
                                        Custom headers can use dashes or underscores.
                                    </p>
                                </div>
                            ) : null}

                            {form.authMode !== "none" ? (
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-white">
                                        Secret token
                                    </label>
                                    <Input
                                        type="password"
                                        value={form.authToken}
                                        onChange={(event) =>
                                            setForm((current) => ({
                                                ...current,
                                                authToken: event.target.value,
                                                keepExistingAuthToken:
                                                    event.target.value.trim()
                                                        ? false
                                                        : current.keepExistingAuthToken
                                            }))
                                        }
                                        placeholder={
                                            editingServer?.hasAuthToken
                                                ? "Leave blank to keep current token"
                                                : "Enter token"
                                        }
                                        disabled={isSaving}
                                        leftSection={
                                            <ShieldCheckIcon className="size-4 text-dark-300" />
                                        }
                                        className="bg-dark-900"
                                    />
                                    {editingServer?.hasAuthToken ? (
                                        <label className="flex items-center gap-2 text-xs text-dark-300">
                                            <Checkbox
                                                checked={form.keepExistingAuthToken}
                                                onChange={(checked) =>
                                                    setForm((current) => ({
                                                        ...current,
                                                        keepExistingAuthToken: checked
                                                    }))
                                                }
                                                disabled={isSaving || !!form.authToken.trim()}
                                            />
                                            Keep saved token
                                            {editingServer.authTokenPreview
                                                ? ` (${editingServer.authTokenPreview})`
                                                : ""}
                                        </label>
                                    ) : null}
                                </div>
                            ) : null}

                            {/* Tool access */}
                            <div className="space-y-3 rounded-md border border-dark-600 bg-dark-900 px-4 py-4">
                                <label className="flex items-start gap-3">
                                    <Checkbox
                                        checked={form.allowAllTools}
                                        onChange={(checked) =>
                                            setForm((current) => ({
                                                ...current,
                                                allowAllTools: checked
                                            }))
                                        }
                                        disabled={isSaving}
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-white">
                                            Allow all discovered tools
                                        </p>
                                        <p className="mt-0.5 text-xs leading-5 text-dark-300">
                                            Turn this off to pick a smaller allowlist for this server.
                                        </p>
                                    </div>
                                </label>

                                {!form.allowAllTools && discoveredToolOptions.length > 0 ? (
                                    <div className="divide-y divide-dark-600 border-t border-dark-600 pt-1">
                                        {discoveredToolOptions.map((toolInfo) => (
                                            <label
                                                key={toolInfo.name}
                                                className="flex items-start gap-3 py-2.5"
                                            >
                                                <Checkbox
                                                    checked={form.allowedTools.includes(toolInfo.name)}
                                                    onChange={(checked) =>
                                                        toggleAllowedTool(toolInfo.name, checked)
                                                    }
                                                    disabled={isSaving}
                                                />
                                                <div>
                                                    <p className="text-sm text-white">
                                                        {toolInfo.title ?? toolInfo.name}
                                                    </p>
                                                    {toolInfo.description ? (
                                                        <p className="mt-0.5 text-xs leading-5 text-dark-300">
                                                            {toolInfo.description}
                                                        </p>
                                                    ) : null}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                ) : null}

                                {!form.allowAllTools && discoveredToolOptions.length === 0 ? (
                                    <p className="border-t border-dark-600 pt-3 text-xs text-dark-300">
                                        No tool list yet. Save the server, then run Test or
                                        Refresh tools before narrowing the allowlist.
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={closeModal}
                                    disabled={isSaving}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" disabled={isSaving}>
                                    {isSaving
                                        ? "Saving..."
                                        : editingServer
                                          ? "Save changes"
                                          : "Add server"}
                                </Button>
                            </div>
                        </form>
                    </div>
                </ModalContent>
            </Modal>
        </>
    );
}
