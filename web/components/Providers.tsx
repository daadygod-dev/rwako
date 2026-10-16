"use client";

import { useEffect, useState } from "react";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toast, toast } from "@heroui/react";
import { ApiError } from "@/lib/api";
import { useUI } from "@/lib/store";

/** Global toast bridge — every failed query/mutation surfaces in HeroUI toasts. */
function useGlobalQueryToasts() {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error, query) => {
            const status = error instanceof ApiError ? error.status : 0;
            const detail = error instanceof ApiError ? error.detail : String(error);
            // 406 = expected "data not available yet" states → warning, not scary red
            if (status === 406) {
              toast.warning("Data not available yet", {
                description: detail,
                actionProps: { children: "See /data", variant: "secondary", onPress: () => { location.href = "/data"; } },
              });
            } else {
              const id = toast.danger("Request failed", {
                description: detail,
                actionProps: {
                  children: "Retry",
                  onPress: () => { toast.close(id); query.fetch(); },
                },
              });
            }
          },
        }),
        defaultOptions: {
          queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );
  return client;
}

/** Applies the persisted theme + rehydrates persisted UI state after mount (SSR-safe). */
function StoreHydration({ children }: { children: React.ReactNode }) {
  const theme = useUI((s) => s.theme);
  useEffect(() => {
    void useUI.persist.rehydrate();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("g-root_theme_dark", theme === "dark");
    root.classList.toggle("g-root_theme_light", theme !== "dark");
  }, [theme]);
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const client = useGlobalQueryToasts();
  return (
    <QueryClientProvider client={client}>
      <Toast.Provider placement="bottom end" maxVisibleToasts={4} />
      <StoreHydration>{children}</StoreHydration>
    </QueryClientProvider>
  );
}
