import React, { useState } from "react";
import { Search as SearchIcon, Regex, X } from "lucide-react";
export interface SearchRule {
  text: string;
  mode: "contains" | "starts" | "ends" | "exact";
  sensitive: boolean;
}
export function matchesRule(value: string, rule: SearchRule): boolean {
  const escaped = rule.text
    .slice(0, 256)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const source = `${rule.mode === "starts" || rule.mode === "exact" ? "^" : ""}${escaped}${rule.mode === "ends" || rule.mode === "exact" ? "$" : ""}`;
  return new RegExp(source, rule.sensitive ? "" : "i").test(
    value.slice(0, 10000),
  );
}
export function SearchField({
  label,
  rule,
  onChange,
}: {
  label: string;
  rule: SearchRule;
  onChange: (rule: SearchRule) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="search-wrap">
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
      {open && (
        <div
          className="regex-popover"
          role="dialog"
          aria-label="Regular expression builder"
        >
          <div className="section-heading">
            <strong>Match builder</strong>
            <button
              aria-label="Close match builder"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          <label>
            Match type
            <select
              value={rule.mode}
              onChange={(e) =>
                onChange({
                  ...rule,
                  mode: e.target.value as SearchRule["mode"],
                })
              }
            >
              <option value="contains">Contains</option>
              <option value="starts">Starts with</option>
              <option value="ends">Ends with</option>
              <option value="exact">Exact text</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={rule.sensitive}
              onChange={(e) =>
                onChange({ ...rule, sensitive: e.target.checked })
              }
            />
            Case sensitive
          </label>
          <small>
            Literal text only. Special characters are escaped, with bounded
            input to prevent expensive patterns.
          </small>
        </div>
      )}
    </div>
  );
}
export const emptyRule: SearchRule = {
  text: "",
  mode: "contains",
  sensitive: false,
};
