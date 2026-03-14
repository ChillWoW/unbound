import { WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { CodeBlock } from "./code-block";

interface MermaidBlockProps {
    chart: string;
}

type MermaidModule = typeof import("mermaid");

let mermaidModulePromise: Promise<MermaidModule> | null = null;
let mermaidInitialized = false;

// Cache rendered SVGs so remounts (e.g. from scroll) don't re-render
const svgCache = new Map<string, string>();

async function getMermaid() {
    mermaidModulePromise ??= import("mermaid");

    const module = await mermaidModulePromise;
    const mermaid = module.default;

    if (!mermaidInitialized) {
        mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "base",
            themeVariables: {
                background: "#141414",
                primaryColor: "#1f1f1f",
                primaryTextColor: "#c9c9c9",
                primaryBorderColor: "#3b3b3b",
                lineColor: "#828282",
                secondaryColor: "#1a1a1a",
                tertiaryColor: "#0d0d0d",
                mainBkg: "#1f1f1f",
                secondBkg: "#1a1a1a",
                tertiaryBkg: "#0d0d0d",
                nodeBorder: "#3b3b3b",
                clusterBkg: "#141414",
                clusterBorder: "#2e2e2e",
                edgeLabelBackground: "#141414",
                textColor: "#c9c9c9",
                fontFamily: "Instrument Sans, sans-serif"
            }
        });

        mermaidInitialized = true;
    }

    return mermaid;
}

export function MermaidBlock({ chart }: MermaidBlockProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState<string | null>(null);
    const cachedSvg = svgCache.get(chart);
    const [svg, setSvg] = useState<string | null>(cachedSvg ?? null);
    const diagramId = useId().replace(/:/g, "");

    useEffect(() => {
        if (svgCache.has(chart)) {
            setSvg(svgCache.get(chart)!);
            setError(null);
            return;
        }

        let isActive = true;
        setSvg(null);
        setError(null);

        void (async () => {
            try {
                const mermaid = await getMermaid();
                const renderId = `mermaid-${diagramId}-${Date.now()}`;
                const { svg: rendered } = await mermaid.render(renderId, chart);

                if (!isActive) return;

                svgCache.set(chart, rendered);
                setSvg(rendered);
            } catch (cause) {
                if (!isActive) return;
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "Unable to render Mermaid diagram."
                );
            }
        })();

        return () => {
            isActive = false;
        };
    }, [chart, diagramId]);

    useEffect(() => {
        if (svg && containerRef.current) {
            containerRef.current.innerHTML = svg;
        }
    }, [svg]);

    if (error) {
        return (
            <div className="my-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <WarningCircleIcon className="size-3.5 shrink-0" weight="fill" />
                    <span>{error}</span>
                </div>
                <CodeBlock language="mermaid">{chart}</CodeBlock>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="my-3 flex h-20 items-center justify-center text-xs text-dark-400">
                Rendering diagram...
            </div>
        );
    }

    return (
        <div className="my-3 overflow-x-auto scrollbar-custom">
            <div
                ref={containerRef}
                className="mermaid-diagram text-dark-50 [&_svg]:min-w-96"
            />
        </div>
    );
}
