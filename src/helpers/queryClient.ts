import { QueryClient } from "@tanstack/react-query";

// Shared singleton so providers mounted above <QueryClientProvider> in the tree
// (NotificationsProvider, CallingProvider) can still read/write the cache via
// queryClient.getQueryData(...) without crashing on useQueryClient().
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Re-navigating to a page within 2 min serves instantly from cache instead
      // of a fresh network round-trip (matches the useFetch QUERY_CONFIG). Stops
      // the "every click reloads from scratch" feel on Leads/Inbox/Settings/etc.
      staleTime: 1000 * 60 * 2,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
