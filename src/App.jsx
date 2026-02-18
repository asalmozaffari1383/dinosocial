import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/login";
import { api, API_BASE_URL } from "./services/api";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function isImage(mediaItem) {
  return (
    typeof mediaItem?.mime_type === "string" &&
    mediaItem.mime_type.startsWith("image/")
  );
}

function appendUniquePosts(existingPosts, incomingPosts) {
  const nextPosts = [...existingPosts];

  incomingPosts.forEach((incomingPost) => {
    const index = nextPosts.findIndex((post) => post.id === incomingPost.id);
    if (index === -1) {
      nextPosts.push(incomingPost);
    } else {
      nextPosts[index] = incomingPost;
    }
  });

  return nextPosts;
}

function normalizeCommentsPayload(payload) {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item) => item && typeof item === "object" && !Array.isArray(item)
    );
  }

  if (Array.isArray(payload?.comments)) {
    return payload.comments.filter(
      (item) => item && typeof item === "object" && !Array.isArray(item)
    );
  }

  return [];
}

function getCommentId(comment) {
  return comment?.id ?? comment?.comment_id ?? comment?._id ?? null;
}

function getCommentAuthor(comment) {
  if (typeof comment?.author === "string") return comment.author;
  if (comment?.author?.username) return comment.author.username;
  if (comment?.user?.username) return comment.user.username;
  return "unknown";
}

function getCommentText(comment) {
  return comment?.text ?? comment?.message ?? comment?.content ?? "";
}

function getCommentTime(comment) {
  return comment?.created_at || comment?.timestamp || "";
}

function getCommentChildren(comment) {
  if (Array.isArray(comment?.children)) return comment.children;
  if (Array.isArray(comment?.replies)) return comment.replies;
  return [];
}

function countCommentsTree(nodes) {
  if (!Array.isArray(nodes)) return 0;

  let total = 0;
  nodes.forEach((node) => {
    total += 1;
    total += countCommentsTree(getCommentChildren(node));
  });
  return total;
}

function CommentNode({ comment, depth = 0 }) {
  const children = getCommentChildren(comment);
  const author = getCommentAuthor(comment);

  return (
    <li style={{ marginLeft: depth * 16 }}>
      <strong>@{author}</strong>{" "}
      <small style={{ color: "#666" }}>
        {formatDate(getCommentTime(comment))}
      </small>
      <p>{getCommentText(comment)}</p>

      {children.length > 0 && (
        <ul>
          {children.map((child, index) => (
            <CommentNode
              key={`${getCommentId(child) || "child"}-${index}`}
              comment={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function FeedView() {
  const { isAuthenticated, logout } = useAuth();
  const limit = 10;
  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState({});
  const [showLogin, setShowLogin] = useState(false);

  const visibleCommentsTotal = useMemo(() => {
    return Object.values(commentsByPost).reduce((sum, state) => {
      return sum + countCommentsTree(state?.items || []);
    }, 0);
  }, [commentsByPost]);

  const loadPosts = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await api.getPosts({ page, limit });
      const incomingPosts = Array.isArray(response?.posts) ? response.posts : [];

      setPosts((prev) => appendUniquePosts(prev, incomingPosts));
      setTotal(Number(response?.total || 0));
    } catch (err) {
      if (err?.status === 401) {
        setError("Unauthorized - please login again.");
        return;
      }
      setError(err?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadComments = useCallback(async (postId) => {
    try {
      const response = await api.getComments({ postId });
      const items = normalizeCommentsPayload(response);
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: { items },
      }));
    } catch (err) {
      if (err?.status !== 401) {
        // Keep feed resilient even if one post comments request fails.
        console.error("Failed loading comments", err);
      }
    }
  }, []);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    posts.forEach((post) => {
      if (post?.id && !commentsByPost[post.id]) {
        loadComments(post.id);
      }
    });
  }, [posts, commentsByPost, loadComments]);

  return (
    <div style={{ padding: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ marginRight: "auto" }}>DinoSocial Live</h1>
        {isAuthenticated ? (
          <button onClick={logout}>Logout</button>
        ) : (
          <button onClick={() => setShowLogin(true)}>Login</button>
        )}
      </div>

      <p style={{ color: "#777" }}>Source: {API_BASE_URL}</p>

      <p>
        Loaded posts: {posts.length} | Total: {total} | Visible comments:{" "}
        {visibleCommentsTotal}
      </p>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {posts.map((post) => {
        const commentsState = commentsByPost[post.id] || {};
        const commentCount = countCommentsTree(commentsState.items || []);

        return (
          <div
            key={post.id}
            style={{
              marginBottom: 40,
              padding: 20,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            <h3>Author #{post.author}</h3>
            <p>{post.text}</p>

            {Array.isArray(post.media) &&
              post.media.map((item) =>
                isImage(item) ? (
                  <img
                    key={item.id}
                    src={item.url}
                    alt=""
                    width="200"
                    style={{ display: "block", marginBottom: 10 }}
                  />
                ) : null
              )}

            <h4>Comments ({commentCount})</h4>

            {commentsState.items?.length > 0 ? (
              <ul>
                {commentsState.items.map((comment, i) => (
                  <CommentNode
                    key={`${getCommentId(comment)}-${i}`}
                    comment={comment}
                  />
                ))}
              </ul>
            ) : (
              <p>No comments</p>
            )}
          </div>
        );
      })}

      {posts.length < total && (
        <button onClick={() => setPage((prev) => prev + 1)}>Load More</button>
      )}

      {showLogin && !isAuthenticated ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <LoginPage
            onSuccess={() => setShowLogin(false)}
            onCancel={() => setShowLogin(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return <FeedView />;
}
