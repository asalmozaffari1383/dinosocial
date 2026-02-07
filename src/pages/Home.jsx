import { useEffect, useState } from "react"

console.log("HOME FILE LOADED")

function Home() {
  console.log("HOME RENDER")

  const [posts, setPosts] = useState([])

  useEffect(() => {
    console.log("USE EFFECT RUN")

    const fetchPosts = async () => {
      try {
        // این URL روی localhost با proxy Vite کار میکنه
        const response = await fetch("/api/posts?page=1&page_size=10")
        const data = await response.json()

        console.log("API RESPONSE FULL:", data)

        // safety check: data.posts باید آرایه باشه
        const safePosts = data?.posts && Array.isArray(data.posts) ? data.posts : []
        console.log("SAFE POSTS:", safePosts)

        setPosts(safePosts)
      } catch (err) {
        console.error("API ERROR:", err)
        // fallback: داده mock اگر مشکلی بود
        const mockPosts = [
          { id: 1, text: "اولین پست تست" },
          { id: 2, text: "دومین پست تست" }
        ]
        setPosts(mockPosts)
      }
    }

    fetchPosts()
  }, [])

  return (
    <div>
      <h2>Posts</h2>

      {posts.length === 0 && <p>No posts yet</p>}

      <ul>
        {posts.map((post, i) => (
          <li key={post?.id ?? i}>
            <strong>Post #{post?.id ?? "?"}</strong>: {post?.text ?? "No text"}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default Home