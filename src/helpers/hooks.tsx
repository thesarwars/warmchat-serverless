import {
  useQuery,
  useMutation,
  useQueryClient,
  QueryKey,
} from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { toast } from "sonner";

const QUERY_CONFIG = {
  staleTime: 1000 * 60 * 2,
  gcTime: 1000 * 60 * 5,
  refetchOnWindowFocus: true,
  retry: 2,
};

type FetchFn<T> =
  | ((uid: string, params: Record<string, unknown>) => Promise<T>)
  | ((params: Record<string, unknown>) => Promise<T>);

export const useFetch = <T = unknown,>(
  queryKey: QueryKey,
  queryFn: FetchFn<T>,
  options: Record<string, unknown> = {},
  config: Record<string, unknown> = {},
  uid = "",
) => {
  const [params, setParams] = useState<Record<string, unknown>>({
    page: 1,
    pageSize: 10,
    ...options,
  });

  const wrappedQueryFn = async (): Promise<T> => {
    return uid
      ? (queryFn as (uid: string, params: Record<string, unknown>) => Promise<T>)(
          uid,
          params,
        )
      : (queryFn as (params: Record<string, unknown>) => Promise<T>)(params);
  };

  const query = useQuery<T>({
    queryKey: [...(Array.isArray(queryKey) ? queryKey : [queryKey]), params],
    queryFn: wrappedQueryFn,
    ...QUERY_CONFIG,
    ...config,
  });

  const setQueryParams = useCallback(
    (newParams: Record<string, unknown>, shouldReplace = false) => {
      if (shouldReplace) {
        setParams({
          page: 1,
          pageSize: 10,
          ...newParams,
        });
      } else {
        setParams((prev) => ({ ...prev, ...newParams }));
      }
    },
    [],
  );

  return { ...query, setQueryParams, params };
};

type MutationOptions<T = unknown> = {
  onSuccess?: (data: T) => void;
  onError?: (error: unknown) => void;
  successMessage?: string;
  errorMessage?: string;
  invalidateKeys?: QueryKey[];
};

export const useApiMutation = <T = unknown, D = unknown>(
  mutationFn: (data: D) => Promise<T>,
  options: MutationOptions<T> = {},
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      if (options.successMessage) {
        toast.success(options.successMessage);
      }

      if (options.invalidateKeys?.length) {
        options.invalidateKeys.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }

      options.onSuccess?.(data);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Something went wrong!";
      toast.error(
        options.errorMessage ||
          (error && typeof error === 'object' && 'response' in error
            ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
            : undefined) ||
          message,
      );
      options.onError?.(error);
    },
  });
};

export const useInvalidate = () => {
  const queryClient = useQueryClient();

  const invalidate = useCallback(
    (queryKey: QueryKey) => {
      queryClient.invalidateQueries({ queryKey: queryKey as QueryKey });
    },
    [queryClient],
  );

  const invalidateMultiple = useCallback(
    (queryKeys: QueryKey[]) => {
      queryKeys.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key as QueryKey });
      });
    },
    [queryClient],
  );

  const resetQueries = useCallback(
    (queryKey: QueryKey) => {
      queryClient.resetQueries({ queryKey: queryKey as QueryKey });
    },
    [queryClient],
  );

  return { invalidate, invalidateMultiple, resetQueries };
};