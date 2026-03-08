import { useState, useCallback } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { CopyIcon, CheckIcon } from "@phosphor-icons/react";

interface CodeBlockProps {
    language: string;
    children: string;
}

export function CodeBlock({ language, children }: CodeBlockProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {}
    }, [children]);

    return (
        <div className="my-3 overflow-hidden rounded-lg border border-dark-600">
            <div className="flex items-center justify-between border-b border-dark-600 px-3 py-1.5">
                {language && (
                    <span className="text-[11px] font-medium text-dark-200 tracking-wide">
                        {language?.charAt(0).toUpperCase() + language?.slice(1)}
                    </span>
                )}
                <button
                    type="button"
                    onClick={handleCopy}
                    className="ml-auto flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-dark-300 transition-colors hover:bg-dark-700 hover:text-white"
                >
                    {copied ? (
                        <>
                            <CheckIcon className="size-3" weight="bold" />
                            Copied
                        </>
                    ) : (
                        <>
                            <CopyIcon className="size-3" weight="bold" />
                            Copy
                        </>
                    )}
                </button>
            </div>
            <SyntaxHighlighter
                language={language || "text"}
                style={vscDarkPlus}
                customStyle={{
                    margin: 0,
                    padding: "12px 16px",
                    background: "transparent",
                    fontSize: "13px",
                    lineHeight: "1.5"
                }}
                codeTagProps={{ style: { fontFamily: '"Geist Mono", monospace' } }}
            >
                {children}
            </SyntaxHighlighter>
        </div>
    );
}
