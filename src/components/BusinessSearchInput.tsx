import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, Building2 } from "lucide-react";
import { searchBusinesses, type BusinessResult } from "@/lib/businessSearchApi";

interface BusinessSearchInputProps {
  name: string;
  defaultValue?: string;
  postcode?: string;
  onSelect: (result: BusinessResult) => void;
  className?: string;
}

export function BusinessSearchInput({
  name,
  defaultValue = "",
  postcode,
  onSelect,
  className,
}: BusinessSearchInputProps) {
  const [query, setQuery] = useState(defaultValue);
  const [results, setResults] = useState<BusinessResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync defaultValue changes (e.g. draft restore)
  useEffect(() => {
    if (defaultValue && !query) setQuery(defaultValue);
  }, [defaultValue]);

  const handleChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (value.trim().length < 3) {
        setResults([]);
        setShowDropdown(false);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const r = await searchBusinesses(value.trim(), postcode);
          setResults(r);
          setShowDropdown(r.length > 0);
        } catch {
          setResults([]);
          setShowDropdown(false);
        } finally {
          setLoading(false);
        }
      }, 400);
    },
    [postcode]
  );

  const handleSelect = useCallback(
    (result: BusinessResult) => {
      setQuery(result.name);
      setShowDropdown(false);
      setResults([]);
      onSelect(result);
    },
    [onSelect]
  );

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          name={name}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder="Search business or enter manually"
          autoComplete="off"
          className={className}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 border border-border rounded-md bg-popover shadow-md max-h-56 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.placeId}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-accent hover:text-accent-foreground border-b border-border last:border-b-0"
              onClick={() => handleSelect(r)}
            >
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{r.address}</p>
                </div>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => {
              setShowDropdown(false);
              setResults([]);
            }}
          >
            Can't find it? Enter company manually.
          </button>
        </div>
      )}
    </div>
  );
}
