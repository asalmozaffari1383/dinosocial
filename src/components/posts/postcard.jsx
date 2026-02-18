function PostCard({ post }) {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.username}>User #{post.id}</span>
        <span style={styles.time}>{post.time}</span>
      </div>

      <p style={styles.text}>{post.text}</p>

      {post.images && post.images.length > 0 && (
        <div style={styles.imageContainer}>
          {post.images.map((img, index) => (
            <img
              key={index}
              src={img}
              alt="post"
              style={styles.image}
            />
          ))}
        </div>
      )}

      <div style={styles.footer}>
        ❤️ {post.likes} Likes
      </div>
    </div>
  )
}

const styles = {
  card: {
    background: "#fff",
    padding: "16px",
    marginBottom: "16px",
    borderRadius: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "8px",
    fontSize: "14px",
    color: "#555",
  },
  username: {
    fontWeight: "bold",
  },
  time: {
    fontSize: "12px",
  },
  text: {
    marginBottom: "12px",
    fontSize: "15px",
  },
  imageContainer: {
    display: "flex",
    gap: "8px",
    overflowX: "auto",
    marginBottom: "12px",
  },
  image: {
    width: "150px",
    height: "150px",
    objectFit: "cover",
    borderRadius: "8px",
  },
  footer: {
    fontSize: "14px",
    color: "#888",
  },
}

export default PostCard