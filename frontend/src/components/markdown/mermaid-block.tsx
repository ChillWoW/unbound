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
                // Base
                background: "#141414", // dark-900
                primaryColor: "#1f1f1f", // dark-800
                primaryTextColor: "#c9c9c9", // dark-50
                primaryBorderColor: "#3b3b3b", // dark-500
                secondaryColor: "#1a1a1a", // dark-850
                tertiaryColor: "#0d0d0d", // dark-950
                lineColor: "#424242", // dark-400
                textColor: "#c9c9c9", // dark-50
                fontFamily: "Instrument Sans, sans-serif",
                fontSize: "14px",

                // Flowchart / graph
                mainBkg: "#1f1f1f", // dark-800
                secondBkg: "#1a1a1a", // dark-850
                tertiaryBkg: "#0d0d0d", // dark-950
                nodeBorder: "#3b3b3b", // dark-500
                clusterBkg: "#141414", // dark-900
                clusterBorder: "#2e2e2e", // dark-600
                edgeLabelBackground: "#1f1f1f", // dark-800

                // Sequence diagrams
                actorBkg: "#1f1f1f", // dark-800
                actorBorder: "#3b3b3b", // dark-500
                actorTextColor: "#c9c9c9", // dark-50
                actorLineColor: "#424242", // dark-400
                signalColor: "#828282", // dark-200
                signalTextColor: "#c9c9c9", // dark-50
                labelBoxBkgColor: "#1f1f1f", // dark-800
                labelBoxBorderColor: "#3b3b3b", // dark-500
                labelTextColor: "#c9c9c9", // dark-50
                loopTextColor: "#c9c9c9", // dark-50
                noteBkgColor: "#242424", // dark-700
                noteBorderColor: "#3b3b3b", // dark-500
                noteTextColor: "#b8b8b8", // dark-100
                activationBkgColor: "#242424", // dark-700
                activationBorderColor: "#3b3b3b", // dark-500
                sequenceNumberColor: "#c9c9c9", // dark-50

                // Gantt
                sectionBkgColor: "#1f1f1f", // dark-800
                altSectionBkgColor: "#1a1a1a", // dark-850
                sectionBkgColor2: "#141414", // dark-900
                taskBorderColor: "#3b3b3b", // dark-500
                taskBkgColor: "#242424", // dark-700
                taskTextColor: "#c9c9c9", // dark-50
                taskTextLightColor: "#c9c9c9",
                taskTextDarkColor: "#c9c9c9",
                taskTextOutsideColor: "#828282", // dark-200
                activeTaskBorderColor: "#696969", // dark-300
                activeTaskBkgColor: "#2e2e2e", // dark-600
                gridColor: "#2e2e2e", // dark-600
                doneTaskBkgColor: "#141414", // dark-900
                doneTaskBorderColor: "#2e2e2e", // dark-600
                critBorderColor: "#696969", // dark-300
                critBkgColor: "#242424", // dark-700
                todayLineColor: "#828282" // dark-200
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
                // Mermaid injects error elements into document.body on failure — remove them
                document.querySelectorAll("[id^='mermaid-']").forEach(el => el.remove());

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
                    <WarningCircleIcon
                        className="size-3.5 shrink-0"
                        weight="fill"
                    />
                    <span>{error}</span>
                </div>
                <CodeBlock language="mermaid">{chart}</CodeBlock>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="my-3 flex h-20 items-center justify-center text-xs text-dark-200">
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
