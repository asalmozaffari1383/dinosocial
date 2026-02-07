const BASE_URL = "http://dinosocial.ir"

export async function getPosts(page = 1, pageSize = 10) {
  const response = await fetch(
    `${BASE_URL}/api/posts?page=${page}&page_size=${pageSize}`
  )

  if (!response.ok) {
    throw new Error("Failed to fetch posts")
  }

  return response.json()
}