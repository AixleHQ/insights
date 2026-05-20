import { useFavoriteProjects, useToggleFavorite, type FavoriteProject } from "@/hooks/useApi";

export type { FavoriteProject };

export function useFavorites() {
  const { data: favorites = [] } = useFavoriteProjects();
  const toggleMutation = useToggleFavorite();

  const toggleFavorite = (project: FavoriteProject) => {
    const favorited = favorites.some((f) => f.id === project.id);
    toggleMutation.mutate({ id: project.id, favorited });
  };

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  return { favorites, toggleFavorite, isFavorite };
}
