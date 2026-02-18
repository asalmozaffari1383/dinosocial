import PostCard from "../components/posts/postcard"

const mockPosts = [
  {
    id: 1,
    text: "اولین پست تستی 🚀",
    time: "2 ساعت پیش",
    likes: 12,
    images: [
      "https://picsum.photos/300/300?1",
      "https://picsum.photos/300/300?2",
    ],
  },
  {
    id: 2,
    text: "داریم UI رو حرفه‌ای می‌سازیم 😎",
    time: "5 دقیقه پیش",
    likes: 30,
    images: [],
  },
]

function Home() {
  return (
    <div style={styles.container}>
      <h2>Home Feed</h2>

      {mockPosts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

const styles = {
  container: {
    maxWidth: "600px",
    margin: "40px auto",
  },
}

export default Home