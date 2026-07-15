import { useEffect, useState } from "react";

import { createLlmClient, MODEL_OPTIONS } from "../llm";
import { useStore } from "../state/store";
import { Combobox, FieldLabel, Section } from "./detail/fields";
import { Icon } from "./icons";

/**
 * App-level settings, opened from the TopBar gear. Today it holds just the LLM
 * configuration: the Anthropic API key and model. The key is stored on this
 * device (see `src/llm/config.ts`) — never in the project folder — and saved as
 * you type, matching the rest of the app's no-explicit-save behaviour. A "Test
 * connection" button exercises the client end-to-end so a bad key surfaces here
 * rather than deep inside a later feature.
 */
export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const llm = useStore((s) => s.llm);
  const setLlmConfig = useStore((s) => s.setLlmConfig);

  const [reveal, setReveal] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Dismiss on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasKey = llm.apiKey.trim().length > 0;

  const runTest = async () => {
    if (testing || !hasKey) return;
    setTesting(true);
    setTestResult(null);
    const r = await createLlmClient().complete({
      prompt: "Reply with the single word: OK.",
      maxTokens: 16,
      temperature: 0,
    });
    setTestResult(r.ok ? { ok: true, msg: "Connected — the API key works." } : { ok: false, msg: r.error });
    setTesting(false);
  };

  return (
    <div
      onMouseDown={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 40,
        background: "rgba(0,0,0,.34)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--bg)",
          border: "1px solid rgba(var(--line),.12)",
          borderRadius: 14,
          boxShadow: "0 24px 60px -18px rgba(0,0,0,.4)",
          padding: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
          <h2 style={{ margin: 0, font: "600 16px 'IBM Plex Sans'", letterSpacing: "-.02em", flex: 1 }}>
            Settings
          </h2>
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 30,
              height: 30,
              border: "none",
              borderRadius: 8,
              background: "transparent",
              color: "var(--sub)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        <div
          style={{
            font: "500 10px 'IBM Plex Mono'",
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--ter)",
            margin: "14px 0 14px",
          }}
        >
          AI · Anthropic
        </div>

        <Section mb={18}>
          <FieldLabel hint="(stored on this device, never in the project folder)">API key</FieldLabel>
          <div style={{ position: "relative" }}>
            <input
              type={reveal ? "text" : "password"}
              value={llm.apiKey}
              placeholder="sk-ant-…"
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => {
                setLlmConfig({ apiKey: e.target.value });
                setTestResult(null);
              }}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "8px 52px 8px 11px",
                border: "1px solid rgba(var(--line),.12)",
                borderRadius: 8,
                outline: "none",
                background: "var(--surface)",
                font: "400 13px 'IBM Plex Mono'",
              }}
            />
            <button
              onClick={() => setReveal((r) => !r)}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                borderRadius: 6,
                background: "transparent",
                color: "var(--ter)",
                cursor: "pointer",
                font: "500 11px 'IBM Plex Sans'",
                padding: "4px 7px",
              }}
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
          <div style={{ font: "400 11px/1.5 'IBM Plex Sans'", color: "var(--ter)", marginTop: 7 }}>
            A Claude Pro/Max subscription doesn't include API access — create a separate
            pay-as-you-go key at console.anthropic.com. Prompts here are small, so a minimum
            credit lasts a long time. The key is sent directly to Anthropic from this app.
          </div>
        </Section>

        <Section mb={20}>
          <FieldLabel>Model</FieldLabel>
          <Combobox
            value={llm.model}
            onChange={(model) => {
              setLlmConfig({ model });
              setTestResult(null);
            }}
            options={[...MODEL_OPTIONS]}
            placeholder="claude-sonnet-5"
            mono
          />
        </Section>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={() => void runTest()}
            disabled={!hasKey || testing}
            style={{
              padding: "8px 14px",
              border: "1px solid rgba(var(--line),.14)",
              borderRadius: 8,
              background: "var(--surface)",
              color: hasKey ? "var(--ink)" : "var(--ter)",
              font: "500 12.5px 'IBM Plex Sans'",
              cursor: hasKey && !testing ? "pointer" : "default",
            }}
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          {testResult ? (
            <span
              style={{
                font: "400 12px/1.4 'IBM Plex Sans'",
                color: testResult.ok ? "oklch(0.6 0.13 150)" : "oklch(0.6 0.18 25)",
                minWidth: 0,
              }}
            >
              {testResult.msg}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
