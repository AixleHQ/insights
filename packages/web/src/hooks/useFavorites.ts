import { useState, useEffect } from "react";

// NOTE: name is snapshotted at pin-time from the project card. If a project is
// renamed server-side, the sidebar will show the old name until the user re-pins.
// When backend persistence lands, reconcile against useProjects cache instead.
export interface FavoriteProject {
  id: string;
  name: string;
}

const STORAGE_KEY = "db90_favorite_projects";
const SYNC_EVENT = "db90:favorites-changed";

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteProject[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as FavoriteProject[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        setFavorites(stored ? (JSON.parse(stored) as FavoriteProject[]) : []);
      } catch {
        setFavorites([]);
      }
    };
    window.addEventListener(SYNC_EVENT, handleSync);
    return () => window.removeEventListener(SYNC_EVENT, handleSync);
  }, []);

  const persist = (next: FavoriteProject[]) => {
    setFavorites(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(SYNC_EVENT));
  };

  const toggleFavorite = (project: FavoriteProject) => {
    const exists = favorites.some((f) => f.id === project.id);
    persist(
      exists
        ? favorites.filter((f) => f.id !== project.id)
        : [...favorites, project],
    );
  };

  const isFavorite = (id: string) => favorites.some((f) => f.id === id);

  return { favorites, toggleFavorite, isFavorite };
}
