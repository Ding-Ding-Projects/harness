import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search as SearchIcon, Regex, X } from "lucide-react";
export interface SearchRule {
  text: string;
  regex: boolean;
  flags: string;
}
export const emptyRule: SearchRule = { text: "", regex: false, flags: "i" };
export function useSearchMatches(values: string[], rule: SearchRule) {
  const [matches, setMatches] = useState<boolean[]>([]),
    [error, setError] = useState("");
  const serialized = JSON.stringify(values);
  useEffect(() => {
    if (!rule.regex) {
      setMatches(
        values.map((value) =>
          value.toLowerCase().includes(rule.text.toLowerCase()),
        ),
      );
      setError("");
      return;
    }
    setMatches(values.map(() => false));
    setError("Evaluating pattern…");
    const worker = new Worker(new URL("./regex.worker.ts", import.meta.url), {
      type: "module",
    });
    const timer = setTimeout(() => {
      worker.terminate();
      setError("Pattern exceeded the 150ms limit. Simplify it.");
    }, 150);
    worker.onmessage = (event) => {
      clearTimeout(timer);
      worker.terminate();
      setMatches(event.data.matches || []);
      setError(event.data.error || "");
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      setError("Pattern evaluation unavailable.");
    };
    worker.postMessage({
      values: values.slice(0, 2000).map((value) => value.slice(0, 10000)),
      pattern: rule.text.slice(0, 256),
      flags: rule.flags,
    });
    return () => {
      clearTimeout(timer);
      worker.terminate();
    };
  }, [serialized, rule.text, rule.regex, rule.flags]);
  return { matches, error };
}
export function SearchField({
  label,
  rule,
  onChange,
  error = "",
}: {
  label: string;
  rule: SearchRule;
  onChange: (rule: SearchRule) => void;
  error?: string;
}) {
  const [open, setOpen] = useState(false),
    [sample, setSample] = useState("Example text");
  const wrapper = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ top: 16, left: 16 });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = wrapper.current!.getBoundingClientRect();
      const height = Math.min(560, innerHeight - 32);
      setPlacement({
        top: Math.max(16, Math.min(rect.bottom + 8, innerHeight - height - 16)),
        left: Math.max(16, Math.min(rect.left, innerWidth - 346)),
      });
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("keydown", escape);
    };
  }, [open]);
  const result = useSearchMatches([sample], rule);
  return (
    <div className="search-wrap" ref={wrapper}>
      <div className="search">
        <SearchIcon size={17} />
        <input
          aria-label={label}
          placeholder={label}
          value={rule.text}
          maxLength={256}
          onChange={(e) => onChange({ ...rule, text: e.target.value })}
        />
        <button
          aria-label="Open regular expression builder"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Regex size={18} />
        </button>
      </div>
      {error && <small role="status">{error}</small>}
      {open &&
        createPortal(
          <div
            className="regex-popover"
            role="dialog"
            aria-label="Regular expression builder"
            style={placement}
          >
            <div className="section-heading">
              <strong>Regex builder</strong>
              <button
                aria-label="Close regex builder"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.regex}
                onChange={(e) => onChange({ ...rule, regex: e.target.checked })}
              />
              Use regular expression
            </label>
            <label>
              Expression
              <input
                value={rule.text}
                maxLength={256}
                onChange={(e) =>
                  onChange({ ...rule, text: e.target.value, regex: true })
                }
              />
            </label>
            <div className="button-row">
              {[
                { name: "Starts with", value: "^" },
                { name: "Ends with", value: "$" },
                { name: "Any character", value: "." },
                { name: "Digit", value: "\\d" },
              ].map((item) => (
                <button
                  key={item.name}
                  onClick={() =>
                    onChange({
                      ...rule,
                      text: (rule.text + item.value).slice(0, 256),
                      regex: true,
                    })
                  }
                >
                  {item.name}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={rule.flags.includes("i")}
                onChange={(e) =>
                  onChange({ ...rule, flags: e.target.checked ? "i" : "" })
                }
              />
              Ignore case
            </label>
            <label>
              Sample text
              <input
                value={sample}
                maxLength={1000}
                onChange={(e) => setSample(e.target.value)}
              />
            </label>
            <small role="status">
              {result.error ||
                (result.matches[0]
                  ? "Sample matches"
                  : "Sample does not match")}
            </small>
            <small>
              Patterns run in an isolated worker with a 150ms limit. Plain text
              is the default. ^ anchors the start; $ anchors the end; . matches
              a character.
            </small>
          </div>,
          document.body,
        )}
    </div>
  );
}
