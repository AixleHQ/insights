import { useProject } from "@/hooks/useApi";

/**
 * Project detail access for pages that render a single project by id.
 *
 * Access can be revoked while a prior successful response is still cached
 * (leave/remove org). Do not render that cache until mount-time revalidation
 * finishes, and treat 403/404 as deny even if `data` remains (AIX-611).
 */
export function useProjectAccess(id: string) {
  const {
    data: project,
    isLoading,
    isFetching,
    isFetchedAfterMount,
    isError,
    error,
  } = useProject(id);

  // Background refetches after mount keep isFetchedAfterMount true, so they
  // do not force a loading skeleton flash.
  const isAwaitingAccessCheck = Boolean(isFetching && !isFetchedAfterMount);

  const errorStatus =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  const isAccessDenied = Boolean(isError && (errorStatus === 403 || errorStatus === 404));

  return {
    project,
    isLoading: isLoading || isAwaitingAccessCheck,
    isAccessDenied,
    isError,
    error,
  };
}
