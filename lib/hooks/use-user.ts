import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUser() {
  const { data, error, mutate, isLoading } = useSWR("/api/user/me", fetcher);
  return { user: data, error, mutate, isLoading };
}
