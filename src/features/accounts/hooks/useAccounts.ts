import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAccountsData } from "../api/accountsData";
import { DEFAULT_XERO_CONFIG, type Period, type XeroConfig } from "../lib/accountsReports";

export function useAccountsData(period: Pick<Period, "from" | "to"> | null) {
  return useQuery({
    // Under ["invoicing"] so issuing, paying or cancelling an invoice refreshes the figures.
    queryKey: ["invoicing", "accounts", period?.from, period?.to],
    queryFn: () => fetchAccountsData(period!),
    enabled: !!period && period.from <= period.to,
    staleTime: 30_000,
  });
}

const XERO_CONFIG_KEY = "axentra.xeroConfig.v1";

function readXeroConfig(): XeroConfig {
  try {
    const raw = window.localStorage.getItem(XERO_CONFIG_KEY);
    if (!raw) return DEFAULT_XERO_CONFIG;
    const saved = JSON.parse(raw) as Partial<XeroConfig>;
    return {
      ...DEFAULT_XERO_CONFIG,
      ...saved,
      expenseAccounts: { ...DEFAULT_XERO_CONFIG.expenseAccounts, ...(saved.expenseAccounts ?? {}) },
    };
  } catch {
    return DEFAULT_XERO_CONFIG;
  }
}

/**
 * Xero account codes + tax rate names. Kept in this browser's storage: they
 * are a mapping onto one Xero organisation, not app data.
 */
export function useXeroConfig(): [XeroConfig, (next: XeroConfig) => void, () => void] {
  const [config, setConfig] = useState<XeroConfig>(readXeroConfig);
  const save = useCallback((next: XeroConfig) => {
    setConfig(next);
    try {
      window.localStorage.setItem(XERO_CONFIG_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: the setting still applies for this visit */
    }
  }, []);
  const reset = useCallback(() => {
    setConfig(DEFAULT_XERO_CONFIG);
    try {
      window.localStorage.removeItem(XERO_CONFIG_KEY);
    } catch {
      /* ignore */
    }
  }, []);
  return [config, save, reset];
}
