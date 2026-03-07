export interface Message {
    role: "user" | "assistant";
    content: string;
}

export interface Conversation {
    id: string;
    title: string;
    updatedAt: number;
    messages: Message[];
}

export const mockStarterPrompts = [
    "Map the first release scope for our AI workspace.",
    "Turn the landing shell into a clean onboarding path.",
    "Draft a conversation list UI that feels calm and premium."
];

export const mockConversations: Conversation[] = [
    {
        id: "product-brief",
        title: "Product brief refresh",
        updatedAt: Date.now() - 1000 * 60 * 12,
        messages: [
            {
                role: "user",
                content:
                    "Let's reframe the landing experience so it feels more like a focused workspace than a marketing page."
            },
            {
                role: "assistant",
                content:
                    "Lead with the composer, keep navigation close, and make the conversation list feel secondary until a thread is active."
            }
        ]
    },
    {
        id: "mobile-shell",
        title: "Mobile shell pass",
        updatedAt: Date.now() - 1000 * 60 * 47,
        messages: [
            {
                role: "user",
                content:
                    "Keep the backend untouched and keep the placeholder conversations isolated so removal later is painless."
            },
            {
                role: "assistant",
                content:
                    "Use a pathless layout route, a local mock data module, and a presentational composer powered by textarea autosize."
            }
        ]
    },
    {
        id: "auth-footer",
        title: "Auth footer ideas",
        updatedAt: Date.now() - 1000 * 60 * 120,
        messages: [
            {
                role: "user",
                content:
                    "The sidebar footer should show user info when authenticated and login/register actions when logged out."
            },
            {
                role: "assistant",
                content:
                    "Generate initials from the name first, fall back to the email handle, and keep the action area compact so it feels native to the rail."
            }
        ]
    }
];

export function getMockConversation(conversationId: string) {
    return mockConversations.find(
        (conversation) => conversation.id === conversationId
    );
}
