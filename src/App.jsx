import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, API_BASE_URL } from "./services/api";

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

function isImage(mediaItem) {
  return typeof mediaItem?.mime_type === "string" && mediaItem.mime_type.startsWith("image/");
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
    if (
      payload.length === 2 &&
      Array.isArray(payload[0]) &&
      typeof payload[1] === "number"
    ) {
      return payload[0].filter((item) => item && typeof item === "object" && !Array.isArray(item));
    }

    return payload.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  if (Array.isArray(payload?.comments)) {
    return payload.comments.filter((item) => item && typeof item === "object" && !Array.isArray(item));
  }

  return [];
}

function getCommentId(comment) {
  return comment?.id ?? comment?.comment_id ?? comment?._id ?? null;
}

function getCommentAuthor(comment) {
  if (typeof comment?.author === "string") {
    return comment.author;
  }

  if (typeof comment?.author === "number") {
    return `user-${comment.author}`;
  }

  if (typeof comment?.username === "string") {
    return comment.username;
  }

  if (comment?.author?.username) {
    return comment.author.username;
  }

  if (comment?.user?.username) {
    return comment.user.username;
  }

  if (typeof comment?.user === "string") {
    return comment.user;
  }

  if (comment?.author_id) {
    return `user-${comment.author_id}`;
  }

  return "unknown";
}

function getCommentText(comment) {
  return comment?.text ?? comment?.message ?? comment?.content ?? "";
}

function getCommentTime(comment) {
  return comment?.created_at || comment?.timestamp || "";
}

function getCommentChildren(comment) {
  if (Array.isArray(comment?.children)) {
    return comment.children;
  }

  if (Array.isArray(comment?.replies)) {
    return comment.replies;
  }

  if (Array.isArray(comment?.comments)) {
    return comment.comments;
  }

  return [];
}

function countCommentsTree(nodes) {
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return 0;
  }

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
    <li className="comment-node" style={{ "--depth": depth }}>
      <div className="comment-head">
        <div className="comment-author-wrap">
          <span className="comment-avatar">{author.charAt(0).toUpperCase()}</span>
          <strong>@{author}</strong>
        </div>
        <span>{formatDate(getCommentTime(comment))}</span>
      </div>
      <p className="comment-text">{getCommentText(comment)}</p>

      {children.length > 0 ? (
        <ul className="comment-children">
          {children.map((child, index) => (
            <CommentNode
              key={`${getCommentId(child) || "child"}-${index}`}
              comment={child}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function LoadingCard() {
  return (
    <article className="post-card loading-card">
      <div className="skeleton skeleton-line short" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-block" />
    </article>
  );
}

export default function App() {
  const limit = 10;
  const [page, setPage] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [commentsByPost, setCommentsByPost] = useState({});

  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);
  const loadedPagesRef = useRef(new Set());
  const commentsRef = useRef({});

  useEffect(() => {
    commentsRef.current = commentsByPost;
  }, [commentsByPost]);

  const visibleCommentsTotal = useMemo(() => {
    return Object.values(commentsByPost).reduce((sum, state) => {
      return sum + countCommentsTree(state?.items || []);
    }, 0);
  }, [commentsByPost]);

  const patchCommentsState = useCallback((postId, updates) => {
    setCommentsByPost((prev) => ({
      ...prev,
      [postId]: {
        loaded: false,
        loading: false,
        error: "",
        items: [],
        ...prev[postId],
        ...updates
      }
    }));
  }, []);

  const loadPostsPage = useCallback(
    async (nextPage, { reset = false } = {}) => {
      if (loadingRef.current) {
        return;
      }

      if (!reset && loadedPagesRef.current.has(nextPage)) {
        return;
      }

      loadingRef.current = true;
      setError("");

      if (reset) {
        setLoadingInitial(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const response = await api.getPosts({ page: nextPage, limit });
        const incomingPosts = Array.isArray(response?.posts) ? response.posts : [];
        const nextTotal = Number(response?.total || 0);

        setPosts((previousPosts) =>
          reset ? incomingPosts : appendUniquePosts(previousPosts, incomingPosts)
        );
        setTotal(nextTotal);
        setPage(nextPage);
        setHasMore(nextPage * limit < nextTotal);

        if (reset) {
          loadedPagesRef.current = new Set([nextPage]);
        } else {
          loadedPagesRef.current.add(nextPage);
        }
      } catch (requestError) {
        setError(requestError.message);
      } finally {
        loadingRef.current = false;
        setLoadingInitial(false);
        setLoadingMore(false);
      }
    },
    [limit]
  );

  const loadComments = useCallback(
    async (postId, { force = false } = {}) => {
      const current = commentsRef.current[postId];

      if (!force && (current?.loaded || current?.loading)) {
        return;
      }

      patchCommentsState(postId, { loading: true, error: "" });

      try {
        const response = await api.getComments({ postId });
        const items = normalizeCommentsPayload(response);

        patchCommentsState(postId, {
          loading: false,
          loaded: true,
          items,
          error: ""
        });
      } catch (requestError) {
        patchCommentsState(postId, {
          loading: false,
          loaded: false,
          error: requestError.message
        });
      }
    },
    [patchCommentsState]
  );

  useEffect(() => {
    setPosts([]);
    setTotal(0);
    setPage(0);
    setHasMore(true);
    loadedPagesRef.current = new Set();
    loadPostsPage(1, { reset: true });
  }, [loadPostsPage]);

  useEffect(() => {
    const sentinelNode = sentinelRef.current;

    if (!sentinelNode || loadingInitial || loadingMore || !hasMore || error) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          loadPostsPage(page + 1);
        }
      },
      {
        root: null,
        rootMargin: "450px 0px",
        threshold: 0.01
      }
    );

    observer.observe(sentinelNode);
    return () => observer.disconnect();
  }, [error, hasMore, loadPostsPage, loadingInitial, loadingMore, page]);

  useEffect(() => {
    posts.forEach((post) => {
      if (post?.id) {
        loadComments(post.id);
      }
    });
  }, [posts, loadComments]);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-copy">
          <p className="brand-kicker">DinoSocial Live</p>
          <h1>Public Thread Feed</h1>
          <p className="brand-subtitle">Posts and comments are public. Source: {API_BASE_URL}</p>
        </div>

        <div className="hero-metrics">
          <article className="metric-card">
            <p>Loaded posts</p>
            <strong>{posts.length}</strong>
          </article>
          <article className="metric-card">
            <p>Total in feed</p>
            <strong>{total}</strong>
          </article>
          <article className="metric-card">
            <p>Visible comments</p>
            <strong>{visibleCommentsTotal}</strong>
          </article>
        </div>
      </header>

      {error ? (
        <div className="error-block">
          <p className="error">{error}</p>
          <button
            type="button"
            onClick={() => loadPostsPage(posts.length === 0 ? 1 : page + 1, { reset: posts.length === 0 })}
          >
            Retry
          </button>
        </div>
      ) : null}

      <main className="posts-grid">
        {loadingInitial
          ? Array.from({ length: 3 }).map((_, idx) => <LoadingCard key={`loading-${idx}`} />)
          : posts.map((post, index) => {
              const commentsState = commentsByPost[post.id] || {};
              const commentCount = countCommentsTree(commentsState.items || []);

              return (
                <article key={post.id} className="post-card" style={{ animationDelay: `${index * 40}ms` }}>
                  <div className="post-head">
                    <div className="author-pill">Author #{post.author}</div>
                    <span className="timestamp">{formatDate(post.created_at)}</span>
                  </div>

                  <p className="post-text">{post.text}</p>

                  {Array.isArray(post.media) && post.media.length > 0 ? (
                    <div className="media-grid">
                      {post.media.map((item) =>
                        isImage(item) ? (
                          <a key={item.id} href={item.url} target="_blank" rel="noreferrer">
                            <img src={item.url} alt={item.mime_type || "post media"} loading="lazy" />
                          </a>
                        ) : (
                          <a key={item.id} href={item.url} target="_blank" rel="noreferrer" className="media-link">
                            {item.mime_type || "media"}
                          </a>
                        )
                      )}
                    </div>
                  ) : null}

                  <section className="comment-panel">
                    <div className="comment-headline">
                      <p className="comment-title">Comments</p>
                      <span className="comment-count">{commentCount}</span>
                    </div>

                    {commentsState.loading ? <p className="muted">Loading comments...</p> : null}
                    {commentsState.error ? <p className="error">{commentsState.error}</p> : null}

                    {Array.isArray(commentsState.items) && commentsState.items.length > 0 ? (
                      <ul className="comment-list">
                        {commentsState.items.map((comment, itemIndex) => (
                          <CommentNode
                            key={`${getCommentId(comment) || "comment"}-${itemIndex}`}
                            comment={comment}
                          />
                        ))}
                      </ul>
                    ) : null}

                    {!commentsState.loading && (!commentsState.items || commentsState.items.length === 0) ? (
                      <p className="muted">No comments yet.</p>
                    ) : null}
                  </section>
                </article>
              );
            })}
      </main>

      {!loadingInitial && posts.length === 0 && !error ? <p className="muted">No posts found.</p> : null}

      <footer className="feed-status">
        {loadingMore ? <p className="muted">Loading more posts...</p> : null}
        {!loadingInitial && !loadingMore && !hasMore && total > 0 ? (
          <p className="muted">You reached the end.</p>
        ) : null}
      </footer>

      <div ref={sentinelRef} className="sentinel" aria-hidden />
    </div>
  );
}
