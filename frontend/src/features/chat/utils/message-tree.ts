import type { ConversationMessage } from "../types";

export type MessageChildrenMap = Map<string | null, ConversationMessage[]>;
export type BranchSelections = Map<string | null, string>;

/**
 * Indexes messages by their parentMessageId, producing a map from
 * parent id (or null for roots) to an array of children sorted by createdAt.
 */
export function buildMessageTree(
    messages: ConversationMessage[]
): MessageChildrenMap {
    const tree: MessageChildrenMap = new Map();

    for (const msg of messages) {
        const parentKey = msg.parentMessageId ?? null;
        const existing = tree.get(parentKey);
        if (existing) {
            existing.push(msg);
        } else {
            tree.set(parentKey, [msg]);
        }
    }

    for (const children of tree.values()) {
        children.sort(
            (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
        );
    }

    return tree;
}

/**
 * Walks from the root to a leaf following activeSelections (or defaulting
 * to the last child at each branch point). Returns the flat ordered list
 * of messages to display.
 */
export function resolveActivePath(
    tree: MessageChildrenMap,
    activeSelections: BranchSelections
): ConversationMessage[] {
    const path: ConversationMessage[] = [];
    let currentParent: string | null = null;

    while (true) {
        const children = tree.get(currentParent);
        if (!children || children.length === 0) break;

        const selectedId = activeSelections.get(currentParent);
        const active =
            (selectedId
                ? children.find((c) => c.id === selectedId)
                : undefined) ?? children[children.length - 1];

        path.push(active);
        currentParent = active.id;
    }

    return path;
}

/**
 * Returns sibling information for a given message: the list of siblings
 * (messages sharing the same parent), the active index, and the total count.
 */
export function getSiblingInfo(
    tree: MessageChildrenMap,
    message: ConversationMessage
): { siblings: ConversationMessage[]; activeIndex: number; total: number } {
    const parentKey = message.parentMessageId ?? null;
    const siblings = tree.get(parentKey) ?? [message];
    const activeIndex = siblings.findIndex((s) => s.id === message.id);

    return {
        siblings,
        activeIndex: activeIndex >= 0 ? activeIndex : siblings.length - 1,
        total: siblings.length
    };
}

/**
 * Given a flat messages array that may lack parentMessageId (legacy data),
 * checks if the tree is well-formed. If all messages have null parentMessageId,
 * treats them as a linear chain and returns a patched copy.
 */
export function ensureTreeStructure(
    messages: ConversationMessage[]
): ConversationMessage[] {
    if (messages.length === 0) return messages;

    const hasAnyParent = messages.some((m) => m.parentMessageId != null);
    if (hasAnyParent) return messages;

    return messages.map((msg, i) => ({
        ...msg,
        parentMessageId: i === 0 ? null : messages[i - 1].id
    }));
}
