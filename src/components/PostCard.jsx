export default function PostCard({ post }) {
  return (
    <div style={{
      background: "white",
      padding: "16px",
      borderRadius: "12px",
      marginBottom: "16px",
      boxShadow: "0 2px 6px rgba(0,0,0,0.08)"
    }}>
      <h3>{post.author?.username || "Unknown"}</h3>
      <p>{post.content}</p>

      {post.comments && (
        <div style={{ marginTop: "12px" }}>
          <strong>Comments:</strong>
          {post.comments.map(comment => (
            <div key={comment.id} style={{ marginLeft: "16px", marginTop: "6px" }}>
              {comment.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
