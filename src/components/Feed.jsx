import { usePosts } from "../hooks/usePosts";
import PostCard from "./PostCard";

export default function Feed() {
  const { posts, loading, error } = usePosts(1, 10);

  if (loading) {
    return <p>Loading posts...</p>;
  }

  if (error) {
    return <p style={{ color: "red" }}>{error}</p>;
  }

  return (
    <div style={{ maxWidth: "700px", margin: "40px auto" }}>
      {posts.map(post => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
