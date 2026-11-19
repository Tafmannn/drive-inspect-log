import { useState, useRef, useCallback, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";
import { searchAddresses, type AddressPrediction } from "@/lib/addressSearchApi";

interface Props {
  onSelect: (prediction: AddressPrediction) => void;
  className?: string;
}

/**
 * Type-ahead address search ("10 Downing St"). Deliberately has no `name`, so it
 * is not part of the submitted form — picking a result fills the real fields.
 */
export function AddressSearchInput({ onSelect, className }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  const handleChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const id = ++requestId.current;

    if (value.trim().length < 4) {
      setResults([]);
      setShowDropdown(false);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const r = await searchAddresses(value.trim());
      // Ignore responses that arrive after a newer keystroke.
      if (id !== requestId.current) return;
      setResults(r);
      setShowDropdown(r.length > 0);
      setLoading(false);
    }, 400);
  }, []);

  const handleSelect = useCallback((p: AddressPrediction) => {
    requestId.current++;
    setQuery("");
    setShowDropdown(false);
    setResults([]);
    onSelect(p);
  }, [onSelect]);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder="Type house number and street, e.g. 10 Downing St"
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
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{r.main}</p>
                  {r.secondary && <p className="text-xs text-muted-foreground truncate">{r.secondary}</p>}
                </div>
              </div>
            </button>
          ))}
          <button
            type="button"
            className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => { setShowDropdown(false); setResults([]); }}
          >
            Can't find it? Enter the address manually.
          </button>
        </div>
      )}
    </div>
  );
}
