import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient — importable outside React (e.g. the replay engine)
 * so imperative fetches share the same cache as hooks.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});
