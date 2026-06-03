import { QueryClient } from "@tanstack/react-query";

// Shared singleton so providers mounted above <QueryClientProvider> in the tree
// (NotificationsProvider, CallingProvider) can still read/write the cache via
// queryClient.getQueryData(...) without crashing on useQueryClient().
export const queryClient = new QueryClient();
