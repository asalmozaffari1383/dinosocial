import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/login";
import { api, API_BASE_URL } from "./services/api";

const styles = {
  page: { padding: 40, background: "linear-gradient(180deg,#f8fbff 0%,#eef4fb 100%)", minHeight: "100vh" },
  card: {
    marginBottom: 28,
    padding: 20,
    border: "1px solid #d6e4f0",
    borderRadius: 14,
    background: "#fff",
    boxShadow: "0 8px 20px rgba(13,45,73,0.08)",
  },
  ghostButton: {
    border: "1px solid #95b9d7",
    borderRadius: 8,
    padding: "4px 9px",
    background: "#f3f9ff",
    color: "#1f4f75",
    fontWeight: 600,
    cursor: "pointer",
  },
  replyBox: {
    marginTop: 6,
    marginBottom: 10,
    padding: 10,
    border: "1px solid #d8e8f4",
    borderRadius: 10,
    background: "#f7fbff",
  },
};

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

function makeOptimisticComment(text) {
  return {
    id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    created_at: new Date().toISOString(),
    author: "you",
    children: [],
    optimistic: true,
  };
}

function upsertChildren(comment, children) {
  if (Array.isArray(comment?.replies) && !Array.isArray(comment?.children)) {
    return { ...comment, replies: children };
  }
  return { ...comment, children };
}

function insertReplyIntoTree(nodes, parentId, reply) {
  if (!Array.isArray(nodes)) return nodes;

  return nodes.map((node) => {
    const nodeId = getCommentId(node);
    const children = getCommentChildren(node);

    if (nodeId === parentId) {
      return upsertChildren(node, [reply, ...children]);
    }

    if (children.length === 0) return node;
    return upsertChildren(node, insertReplyIntoTree(children, parentId, reply));
  });
}

function removeCommentFromTree(nodes, targetId) {
  if (!Array.isArray(nodes)) return nodes;

  return nodes
    .filter((node) => getCommentId(node) !== targetId)
    .map((node) => {
      const children = getCommentChildren(node);
      if (children.length === 0) return node;
      return upsertChildren(node, removeCommentFromTree(children, targetId));
    });
}

function updateCommentInTree(nodes, targetId, updater) {
  if (!Array.isArray(nodes)) return nodes;

  return nodes.map((node) => {
    const nodeId = getCommentId(node);
    let nextNode = node;

    if (nodeId === targetId) {
      nextNode = updater(node);
    }

    const children = getCommentChildren(nextNode);
    if (children.length === 0) return nextNode;
    return upsertChildren(
      nextNode,
      updateCommentInTree(children, targetId, updater)
    );
  });
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

function CommentNode({
  postId,
  comment,
  depth = 0,
  expandedCommentsById,
  activeReplyFormKey,
  replyTextById,
  replySubmittingById,
  replyErrorById,
  onToggleReplies,
  onToggleReplyForm,
  onReplyTextChange,
  onSubmitReply,
}) {
  const children = getCommentChildren(comment);
  const author = getCommentAuthor(comment);
  const commentId = getCommentId(comment);
  const nodeKey = `${postId}:${commentId}`;
  const isExpanded = Boolean(expandedCommentsById[nodeKey]);
  const isReplyFormOpen = activeReplyFormKey === nodeKey;
  const replyDraft = replyTextById[nodeKey] || "";
  const replySubmitting = Boolean(replySubmittingById[nodeKey]);
  const replyError = replyErrorById[nodeKey] || "";
  const canReply = commentId !== null && commentId !== undefined;

  return (
    <li
      style={{
        marginLeft: depth * 16,
        padding: "10px 10px 8px",
        border: "1px solid #e0ebf4",
        borderRadius: 10,
        background: "#fbfdff",
        marginBottom: 8,
      }}
    >
      <strong>@{author}</strong>{" "}
      <small style={{ color: "#666" }}>
        {formatDate(getCommentTime(comment))}
      </small>
      <p>{getCommentText(comment)}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {canReply ? (
          <button
            type="button"
            onClick={() => onToggleReplyForm(nodeKey)}
            style={styles.ghostButton}
          >
            {isReplyFormOpen ? "Cancel" : "Reply"}
          </button>
        ) : null}

        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleReplies(nodeKey)}
            style={styles.ghostButton}
          >
            {isExpanded ? "Hide replies" : `Show replies (${children.length})`}
          </button>
        ) : null}
      </div>

      {isReplyFormOpen ? (
        <div style={styles.replyBox}>
          <textarea
            value={replyDraft}
            onChange={(event) => onReplyTextChange(nodeKey, event.target.value)}
            placeholder="Write a reply..."
            rows={2}
            style={{ width: "100%", marginBottom: 8, padding: 8, border: "1px solid #bfd3e5", borderRadius: 8 }}
          />
          <button
            type="button"
            onClick={() => onSubmitReply(postId, commentId, nodeKey)}
            disabled={replySubmitting || !replyDraft.trim()}
            style={styles.ghostButton}
          >
            {replySubmitting ? "Posting..." : "Post Reply"}
          </button>
          {replyError ? (
            <p style={{ color: "red", marginTop: 6, marginBottom: 0 }}>
              {replyError}
            </p>
          ) : null}
        </div>
      ) : null}

      {children.length > 0 && isExpanded ? (
        <ul>
          {children.map((child, index) => (
            <CommentNode
              key={`${getCommentId(child) || "child"}-${index}`}
              postId={postId}
              comment={child}
              depth={depth + 1}
              expandedCommentsById={expandedCommentsById}
              activeReplyFormKey={activeReplyFormKey}
              replyTextById={replyTextById}
              replySubmittingById={replySubmittingById}
              replyErrorById={replyErrorById}
              onToggleReplies={onToggleReplies}
              onToggleReplyForm={onToggleReplyForm}
              onReplyTextChange={onReplyTextChange}
              onSubmitReply={onSubmitReply}
            />
          ))}
        </ul>
      ) : null}
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

  const [newCommentByPost, setNewCommentByPost] = useState({});
  const [commentSubmittingByPost, setCommentSubmittingByPost] = useState({});
  const [commentErrorByPost, setCommentErrorByPost] = useState({});

  const [expandedCommentsById, setExpandedCommentsById] = useState({});
  const [activeReplyFormKey, setActiveReplyFormKey] = useState(null);
  const [replyTextById, setReplyTextById] = useState({});
  const [replySubmittingById, setReplySubmittingById] = useState({});
  const [replyErrorById, setReplyErrorById] = useState({});

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
        console.error("Failed loading comments", err);
      }
    }
  }, []);

  const handleCommentInputChange = useCallback((postId, value) => {
    setNewCommentByPost((prev) => ({ ...prev, [postId]: value }));
  }, []);

  const handleAddComment = useCallback(
    async (postId) => {
      const draft = (newCommentByPost[postId] || "").trim();
      if (!draft) return;

      if (!isAuthenticated) {
        setShowLogin(true);
        setCommentErrorByPost((prev) => ({
          ...prev,
          [postId]: "You need to login to add a comment.",
        }));
        return;
      }

      const optimisticComment = makeOptimisticComment(draft);

      setCommentErrorByPost((prev) => ({ ...prev, [postId]: "" }));
      setCommentSubmittingByPost((prev) => ({ ...prev, [postId]: true }));
      setCommentsByPost((prev) => {
        const prevItems = prev[postId]?.items || [];
        return {
          ...prev,
          [postId]: { items: [optimisticComment, ...prevItems] },
        };
      });
      setNewCommentByPost((prev) => ({ ...prev, [postId]: "" }));

      try {
        await api.createComment({ postId, text: draft, parentId: null });
        await loadComments(postId);
      } catch (err) {
        setCommentsByPost((prev) => {
          const prevItems = prev[postId]?.items || [];
          return {
            ...prev,
            [postId]: {
              items: prevItems.filter((item) => item.id !== optimisticComment.id),
            },
          };
        });

        if (err?.status === 401) {
          setShowLogin(true);
          setCommentErrorByPost((prev) => ({
            ...prev,
            [postId]: "Session expired. Please login again.",
          }));
        } else {
          setCommentErrorByPost((prev) => ({
            ...prev,
            [postId]: err?.message || "Failed to add comment.",
          }));
        }
      } finally {
        setCommentSubmittingByPost((prev) => ({ ...prev, [postId]: false }));
      }
    },
    [isAuthenticated, loadComments, newCommentByPost]
  );

  const toggleReplies = useCallback((nodeKey) => {
    setExpandedCommentsById((prev) => ({
      ...prev,
      [nodeKey]: !prev[nodeKey],
    }));
  }, []);

  const toggleReplyForm = useCallback((nodeKey) => {
    setActiveReplyFormKey((prev) => (prev === nodeKey ? null : nodeKey));
    setReplyErrorById((prev) => ({
      ...prev,
      [nodeKey]: "",
    }));
  }, []);

  const handleReplyTextChange = useCallback((nodeKey, value) => {
    setReplyTextById((prev) => ({
      ...prev,
      [nodeKey]: value,
    }));
  }, []);

  const handleSubmitReply = useCallback(
    async (postId, parentId, nodeKey) => {
      const draft = (replyTextById[nodeKey] || "").trim();
      if (!draft) return;

      if (!isAuthenticated) {
        setShowLogin(true);
        setReplyErrorById((prev) => ({
          ...prev,
          [nodeKey]: "You need to login to reply.",
        }));
        return;
      }

      const optimisticReply = makeOptimisticComment(draft);

      setReplyErrorById((prev) => ({
        ...prev,
        [nodeKey]: "",
      }));
      setReplySubmittingById((prev) => ({
        ...prev,
        [nodeKey]: true,
      }));

      setCommentsByPost((prev) => {
        const items = prev[postId]?.items || [];
        return {
          ...prev,
          [postId]: {
            items: insertReplyIntoTree(items, parentId, optimisticReply),
          },
        };
      });

      setExpandedCommentsById((prev) => ({
        ...prev,
        [nodeKey]: true,
      }));
      setReplyTextById((prev) => ({
        ...prev,
        [nodeKey]: "",
      }));

      try {
        const response = await api.createComment({ postId, text: draft, parentId });
        const realId = response?.id ?? response?.comment_id ?? null;

        setCommentsByPost((prev) => {
          const items = prev[postId]?.items || [];
          return {
            ...prev,
            [postId]: {
              items: updateCommentInTree(items, optimisticReply.id, (node) => ({
                ...node,
                id: realId || node.id,
                optimistic: false,
              })),
            },
          };
        });

        setActiveReplyFormKey((prev) => (prev === nodeKey ? null : prev));
      } catch (err) {
        setCommentsByPost((prev) => {
          const items = prev[postId]?.items || [];
          return {
            ...prev,
            [postId]: {
              items: removeCommentFromTree(items, optimisticReply.id),
            },
          };
        });

        if (err?.status === 401) {
          setShowLogin(true);
          setReplyErrorById((prev) => ({
            ...prev,
            [nodeKey]: "Session expired. Please login again.",
          }));
        } else {
          setReplyErrorById((prev) => ({
            ...prev,
            [nodeKey]: err?.message || "Failed to post reply.",
          }));
        }
      } finally {
        setReplySubmittingById((prev) => ({
          ...prev,
          [nodeKey]: false,
        }));
      }
    },
    [isAuthenticated, replyTextById]
  );

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

  useEffect(() => {
    if (!showLogin) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setShowLogin(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showLogin]);

  return (
    <div style={styles.page}>
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
        const commentDraft = newCommentByPost[post.id] || "";
        const submittingComment = Boolean(commentSubmittingByPost[post.id]);
        const commentError = commentErrorByPost[post.id] || "";

        return (
          <div
            key={post.id}
            style={styles.card}
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

            <div style={{ marginBottom: 12 }}>
              <textarea
                value={commentDraft}
                onChange={(event) =>
                  handleCommentInputChange(post.id, event.target.value)
                }
                placeholder="Write a comment..."
                rows={3}
                style={{
                  width: "100%",
                  marginBottom: 8,
                  padding: 8,
                  border: "1px solid #bfd3e5",
                  borderRadius: 8,
                  background: "#f8fbff",
                }}
              />
              <button
                onClick={() => handleAddComment(post.id)}
                disabled={submittingComment || !commentDraft.trim()}
              >
                {submittingComment ? "Posting..." : "Add Comment"}
              </button>
              {commentError ? (
                <p style={{ color: "red", marginTop: 8 }}>{commentError}</p>
              ) : null}
            </div>

            {commentsState.items?.length > 0 ? (
              <ul>
                {commentsState.items.map((comment, i) => (
                  <CommentNode
                    key={`${getCommentId(comment)}-${i}`}
                    postId={post.id}
                    comment={comment}
                    expandedCommentsById={expandedCommentsById}
                    activeReplyFormKey={activeReplyFormKey}
                    replyTextById={replyTextById}
                    replySubmittingById={replySubmittingById}
                    replyErrorById={replyErrorById}
                    onToggleReplies={toggleReplies}
                    onToggleReplyForm={toggleReplyForm}
                    onReplyTextChange={handleReplyTextChange}
                    onSubmitReply={handleSubmitReply}
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
          onClick={() => setShowLogin(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(8, 22, 39, 0.45)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <LoginPage
              onSuccess={() => setShowLogin(false)}
              onCancel={() => setShowLogin(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  return <FeedView />;
}
