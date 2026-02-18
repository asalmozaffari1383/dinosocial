import { useEffect, useState } from "react";
import { api } from "../api";

export function usePosts(page = 1, limit = 10) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadPosts() {
      try {
        setLoading(true);
        setError(null);

        const data = await api.getPosts({ page, limit });

        if (mounted) {
          setPosts(data.posts || data);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadPosts();

    return () => {
      mounted = false;
    };
  }, [page, limit]);

  return { posts, loading, error };
}
