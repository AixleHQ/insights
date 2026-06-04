import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: (failureCount, error) => {
        // Never retry on authorization or not-found errors — these are definitive
        if (error instanceof ApiError && (error.status === 403 || error.status === 404)) {
          return false;
        }
        return failureCount < 1;
      },
      retryDelay: 500,
      refetchOnWindowFocus: false,
    },
  },
});
