import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/login";
import { api, API_BASE_URL } from "./services/api";

const SIDEBAR_ITEMS = [
  { label: "Home", icon: "home" },
  { label: "Notifications", icon: "bell" },
  { label: "Messages", icon: "mail" },
  { label: "Profile", icon: "user" },
];
const SUGGESTED_USERS = ["@dino_dev", "@frontend_daily", "@react_ninja"];

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function isImage(mediaItem) {
  if (typeof mediaItem === "string") {
    return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(mediaItem);
  }
  return (
    typeof mediaItem?.mime_type === "string" &&
    mediaItem.mime_type.startsWith("image/")
  );
}

function getMediaUrl(mediaItem) {
  if (typeof mediaItem === "string") return mediaItem;
  return mediaItem?.url || "";
}

function getPostAuthor(post) {
  if (post?.author && typeof post.author === "object") {
    return {
      id: post.author.id ?? null,
      username: post.author.username || "",
      name: post.author.name || "",
      profileImageUrl: post.author.profile_image_url || "",
    };
  }

  if (typeof post?.author === "string" || typeof post?.author === "number") {
    return {
      id: null,
      username: String(post.author),
      name: "",
      profileImageUrl: "",
    };
  }

  return {
    id: null,
    username: "",
    name: "",
    profileImageUrl: "",
  };
}

function getPostAuthorLabel(post) {
  const author = getPostAuthor(post);
  return author.name || author.username || "Unknown";
}

function getPostMediaItems(post) {
  if (!Array.isArray(post?.media)) return [];

  return post.media
    .filter((item) => isImage(item) && getMediaUrl(item))
    .slice(0, 8)
    .map((item, index) => ({
      id: item?.id || `media-${index}`,
      url: getMediaUrl(item),
    }));
}

function hasUnsupportedVideoMedia(post) {
  if (!Array.isArray(post?.media)) return false;
  return post.media.some(
    (item) =>
      typeof item === "object" &&
      typeof item?.mime_type === "string" &&
      item.mime_type.startsWith("video/")
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
  if (comment?.author?.name) return comment.author.name;
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
        border: "1px solid var(--tw-border-soft)",
        borderRadius: 10,
        background: "var(--tw-surface-soft)",
        marginBottom: 8,
      }}
    >
      <strong>@{author}</strong>{" "}
      <small style={{ color: "var(--tw-muted)" }}>
        {formatDate(getCommentTime(comment))}
      </small>
      <p>{getCommentText(comment)}</p>

      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        {canReply ? (
          <button
            type="button"
            onClick={() => onToggleReplyForm(nodeKey)}
            className="mini-action-btn"
          >
            {isReplyFormOpen ? "Cancel" : "Reply"}
          </button>
        ) : null}

        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggleReplies(nodeKey)}
            className="mini-action-btn"
          >
            {isExpanded ? "Hide replies" : `Show replies (${children.length})`}
          </button>
        ) : null}
      </div>

      {isReplyFormOpen ? (
        <div className="reply-editor">
          <textarea
            value={replyDraft}
            onChange={(event) => onReplyTextChange(nodeKey, event.target.value)}
            placeholder="Write a reply..."
            rows={2}
            style={{
              width: "100%",
              marginBottom: 8,
              padding: 8,
              border: "1px solid var(--tw-input-border)",
              borderRadius: 8,
              background: "var(--tw-surface)",
              color: "var(--tw-page-text)",
            }}
          />
          <button
            type="button"
            onClick={() => onSubmitReply(postId, commentId, nodeKey)}
            disabled={replySubmitting || !replyDraft.trim()}
            className="mini-action-btn"
          >
            {replySubmitting ? "Posting..." : "Post Reply"}
          </button>
          {replyError ? (
            <p style={{ color: "#c73939", marginTop: 6, marginBottom: 0 }}>
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

function PostMediaCarousel({ items }) {
  const trackRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  const recalcActive = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;

    const slides = Array.from(track.querySelectorAll(".tw-media-slide"));
    if (slides.length === 0) return;

    const leftEdge = track.scrollLeft + 2;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft - leftEdge);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    setActiveIndex(bestIndex);
  }, []);

  useEffect(() => {
    recalcActive();
  }, [items, recalcActive]);

  const scrollToIndex = useCallback((index) => {
    const track = trackRef.current;
    if (!track) return;
    const slides = Array.from(track.querySelectorAll(".tw-media-slide"));
    const target = slides[index];
    if (!target) return;
    track.scrollTo({ left: target.offsetLeft, behavior: "smooth" });
    setActiveIndex(index);
  }, []);

  const goPrev = () => {
    if (items.length === 0) return;
    scrollToIndex(Math.max(0, activeIndex - 1));
  };

  const goNext = () => {
    if (items.length === 0) return;
    scrollToIndex(Math.min(items.length - 1, activeIndex + 1));
  };

  const openViewer = (index) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <div className="tw-media-carousel">
      {items.length > 1 ? (
        <div className="tw-media-controls">
          <button type="button" className="mini-action-btn" onClick={goPrev}>
            ←
          </button>
          <span className="tw-media-counter">
            {activeIndex + 1}/{items.length}
          </span>
          <button type="button" className="mini-action-btn" onClick={goNext}>
            →
          </button>
        </div>
      ) : null}

      <div
        ref={trackRef}
        className="tw-media-track"
        onScroll={recalcActive}
      >
        {items.map((item, index) => (
          <article
            key={item.id}
            className={`tw-media-slide ${activeIndex === index ? "is-active" : ""}`}
            onClick={() => openViewer(index)}
          >
            <img src={item.url} alt="" loading="lazy" />
          </article>
        ))}
      </div>

      {viewerOpen ? (
        <div className="tw-media-viewer" onClick={() => setViewerOpen(false)}>
          <div
            className="tw-media-viewer-body"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="mini-action-btn tw-media-viewer-close"
              onClick={() => setViewerOpen(false)}
            >
              Close
            </button>
            {items.length > 1 ? (
              <button
                type="button"
                className="mini-action-btn tw-media-viewer-prev"
                onClick={() =>
                  setViewerIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1))
                }
              >
                ←
              </button>
            ) : null}
            <img src={items[viewerIndex]?.url} alt="" />
            {items.length > 1 ? (
              <button
                type="button"
                className="mini-action-btn tw-media-viewer-next"
                onClick={() =>
                  setViewerIndex((prev) => (prev + 1) % items.length)
                }
              >
                →
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FeedView() {
  const { isAuthenticated, username, logout } = useAuth();
  const limit = 10;

  const [page, setPage] = useState(1);
  const [posts, setPosts] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [commentsByPost, setCommentsByPost] = useState({});
  const [showLogin, setShowLogin] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [createPostText, setCreatePostText] = useState("");
  const [createPostImages, setCreatePostImages] = useState([]);
  const [createPostSubmitting, setCreatePostSubmitting] = useState(false);
  const [createPostError, setCreatePostError] = useState("");

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

  const refreshFeedFromStart = useCallback(async () => {
    try {
      const response = await api.getPosts({ page: 1, limit });
      const incomingPosts = Array.isArray(response?.posts) ? response.posts : [];
      setPosts(incomingPosts);
      setTotal(Number(response?.total || 0));
      setPage(1);
      setCommentsByPost({});
    } catch (err) {
      setError(err?.message || "Failed to refresh feed");
    }
  }, [limit]);

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

  const displayName = isAuthenticated ? username || "User" : "Guest";
  const avatarChar = displayName.charAt(0).toUpperCase();
  const createPostCharCount = createPostText.length;

  const closeCreatePost = useCallback(() => {
    setShowCreatePost(false);
    setCreatePostText("");
    setCreatePostError("");
    setCreatePostImages((prev) => {
      prev.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
  }, []);

  const openCreatePost = useCallback(() => {
    setCreatePostError("");
    setShowCreatePost(true);
  }, []);

  const handleCreatePostImageSelect = useCallback((event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setCreatePostImages((prev) => {
      const next = [...prev];
      files.slice(0, Math.max(0, 8 - next.length)).forEach((file) => {
        next.push({
          id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      });
      return next;
    });

    event.target.value = "";
  }, []);

  const handleRemoveCreateImage = useCallback((id) => {
    setCreatePostImages((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const handleSubmitCreatePost = useCallback(async () => {
    const text = createPostText.trim();
    const selectedFiles = createPostImages.map((item) => item.file).filter(Boolean);
    if (!text && selectedFiles.length === 0) return;

    if (!isAuthenticated) {
      setShowLogin(true);
      setCreatePostError("You need to login to post.");
      return;
    }

    try {
      setCreatePostSubmitting(true);
      setCreatePostError("");

      await api.createPost({
        text,
        files: selectedFiles,
      });

      await refreshFeedFromStart();
      closeCreatePost();
    } catch (err) {
      setCreatePostError(err?.message || "Failed to create post.");
    } finally {
      setCreatePostSubmitting(false);
    }
  }, [
    closeCreatePost,
    createPostImages,
    createPostText,
    isAuthenticated,
    refreshFeedFromStart,
  ]);

  const mobileBarItems = [
    { key: "home", label: "Home", icon: "home" },
    { key: "messages", label: "Messages", icon: "mail" },
    { key: "search", label: "Search", icon: "search" },
    {
      key: "create",
      label: "Create",
      icon: "plus",
      onClick: openCreatePost,
    },
    {
      key: "auth",
      label: isAuthenticated ? "Logout" : "Login",
      icon: isAuthenticated ? "logout" : "login",
      onClick: () => (isAuthenticated ? logout() : setShowLogin(true)),
    },
  ];

  return (
    <div className="tw-app-shell">
      <aside className="tw-sidebar">
        <div className="tw-logo">
          <img src="/dino-logo.png" alt="DinoSocial logo" />
          <span>DinoSocial</span>
        </div>
        <nav className="tw-nav">
          {SIDEBAR_ITEMS.map((item) => (
            <button key={item.label} className="tw-nav-item" type="button">
              <span className="tw-nav-icon" aria-hidden="true">
                <NavIcon name={item.icon} />
              </span>
              <span className="tw-nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <button onClick={openCreatePost} className="tw-nav-item tw-add-post-item" type="button">
          <span className="tw-nav-icon" aria-hidden="true">
            <NavIcon name="plus" />
          </span>
          <span className="tw-nav-label">Add Post</span>
        </button>

        <div className="tw-session-box">
          <div className="tw-profile-row">
            <div className="tw-avatar">{avatarChar}</div>
            <div className="tw-profile-meta">
              <strong>{displayName}</strong>
              <small>{isAuthenticated ? "Online" : "Not signed in"}</small>
            </div>
          </div>
          {isAuthenticated ? (
            <button onClick={logout} className="tw-session-btn" type="button">
              Logout
            </button>
          ) : (
            <button
              onClick={() => setShowLogin(true)}
              className="tw-session-btn"
              type="button"
            >
              Login
            </button>
          )}
        </div>
      </aside>

      <main className="tw-feed-column">
        <header className="tw-feed-header">
          <div className="tw-feed-header-top">
            <h1>DinoSocial Live</h1>
            <div className="tw-mobile-top-actions">
              <button type="button" className="tw-mobile-top-btn">
                <span className="tw-nav-icon" aria-hidden="true">
                  <NavIcon name="bell" />
                </span>
              </button>
              <button
                type="button"
                className="tw-mobile-top-btn"
                onClick={() => {
                  if (!isAuthenticated) setShowLogin(true);
                }}
              >
                <span className="tw-nav-icon" aria-hidden="true">
                  <NavIcon name="user" />
                </span>
              </button>
            </div>
          </div>
          <p>Source: {API_BASE_URL}</p>
        </header>

        <div className="tw-metrics">
          Loaded posts: {posts.length} | Total: {total} | Visible comments:{" "}
          {visibleCommentsTotal}
        </div>

        {loading && <p>Loading...</p>}
        {error && <p style={{ color: "#c73939" }}>{error}</p>}

        {posts.map((post) => {
          const commentsState = commentsByPost[post.id] || {};
          const commentCount = countCommentsTree(commentsState.items || []);
          const commentDraft = newCommentByPost[post.id] || "";
          const submittingComment = Boolean(commentSubmittingByPost[post.id]);
          const commentError = commentErrorByPost[post.id] || "";
          const mediaItems = getPostMediaItems(post);
          const hasUnsupportedVideo = hasUnsupportedVideoMedia(post);

          return (
            <article key={post.id} className="tw-post-card">
              <h3>Author: {getPostAuthorLabel(post)}</h3>
              <p>{post.text}</p>

              {mediaItems.length > 0 ? <PostMediaCarousel items={mediaItems} /> : null}
              {hasUnsupportedVideo ? (
                <p className="tw-media-note">
                  Video playback is not supported yet in this feed.
                </p>
              ) : null}

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
                    border: "1px solid var(--tw-input-border)",
                    borderRadius: 8,
                    background: "var(--tw-surface)",
                    color: "var(--tw-page-text)",
                  }}
                />
                <button
                  onClick={() => handleAddComment(post.id)}
                  disabled={submittingComment || !commentDraft.trim()}
                >
                  {submittingComment ? "Posting..." : "Add Comment"}
                </button>
                {commentError ? (
                  <p style={{ color: "#c73939", marginTop: 8 }}>{commentError}</p>
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
            </article>
          );
        })}

        {posts.length < total && (
          <button onClick={() => setPage((prev) => prev + 1)}>Load More</button>
        )}
      </main>

      <aside className="tw-right-panel">
        <div className="tw-panel-card">
          <input className="tw-search" placeholder="Search" />
        </div>

        <div className="tw-panel-card tw-who-card">
          <h3>Who to follow</h3>
          <ul className="tw-list">
            {SUGGESTED_USERS.map((user) => (
              <li key={user}>{user}</li>
            ))}
          </ul>
        </div>
      </aside>

      {showLogin && !isAuthenticated ? (
        <div
          onClick={() => setShowLogin(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--tw-overlay)",
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

      {showCreatePost ? (
        <div className="tw-compose-overlay" onClick={closeCreatePost}>
          <div className="tw-compose-card" onClick={(event) => event.stopPropagation()}>
            <div className="tw-compose-head">
              <div className="tw-compose-user">
                <div className="tw-avatar">{avatarChar}</div>
                <div>
                  <strong>{displayName}</strong>
                  <small>@{(username || "you").toLowerCase()}</small>
                </div>
              </div>
              <button type="button" className="mini-action-btn" onClick={closeCreatePost}>
                Close
              </button>
            </div>

            <textarea
              className="tw-compose-textarea"
              placeholder="What's happening?"
              value={createPostText}
              onChange={(event) => setCreatePostText(event.target.value)}
              maxLength={280}
              rows={6}
            />

            <div className="tw-compose-actions">
              <label className="tw-compose-upload">
                + Image
                <input type="file" accept="image/*" multiple onChange={handleCreatePostImageSelect} />
              </label>

              <span className="tw-compose-count">{createPostCharCount}/280</span>

              <button
                type="button"
                disabled={!createPostText.trim() || createPostSubmitting}
                onClick={handleSubmitCreatePost}
              >
                {createPostSubmitting ? "Posting..." : "Post"}
              </button>
            </div>

            {createPostImages.length > 0 ? (
              <div className="tw-compose-preview-grid">
                {createPostImages.map((item) => (
                  <div key={item.id} className="tw-compose-preview-item">
                    <img src={item.previewUrl} alt="" />
                    <button
                      type="button"
                      className="mini-action-btn"
                      onClick={() => handleRemoveCreateImage(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {createPostError ? <p className="error">{createPostError}</p> : null}
          </div>
        </div>
      ) : null}

      <nav className="tw-mobile-bar" aria-label="Mobile navigation">
        {mobileBarItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className="tw-mobile-btn"
            onClick={item.onClick}
          >
            <span className="tw-mobile-icon" aria-hidden="true">
              <NavIcon name={item.icon} />
            </span>
            <span className="tw-mobile-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function NavIcon({ name }) {
  switch (name) {
    case "home":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5.5 9.8V21h13V9.8" />
        </svg>
      );
    case "bell":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M15 18H5.5c1.8-1.8 2.5-3.3 2.5-6V9a4 4 0 1 1 8 0v3c0 2.7.8 4.2 2.5 6H15Z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
      );
    case "mail":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
          <path d="m4.5 7 7.5 6 7.5-6" />
        </svg>
      );
    case "user":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="12" cy="8" r="3.5" />
          <path d="M4 20a8 8 0 0 1 16 0" />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      );
    case "login":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M13 4h6v16h-6" />
          <path d="m3 12 8-6v4h6v4h-6v4z" />
        </svg>
      );
    case "logout":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M11 4H5v16h6" />
          <path d="m21 12-8 6v-4H7v-4h6V6z" />
        </svg>
      );
    default:
      return null;
  }
}

export default function App() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const applyTheme = (isDark) => {
      document.documentElement.setAttribute(
        "data-theme",
        isDark ? "dark" : "light"
      );
    };

    applyTheme(media.matches);

    const onThemeChange = (event) => {
      applyTheme(event.matches);
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onThemeChange);
      return () => media.removeEventListener("change", onThemeChange);
    }

    media.addListener(onThemeChange);
    return () => media.removeListener(onThemeChange);
  }, []);

  return <FeedView />;
}

