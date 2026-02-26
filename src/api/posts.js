import { API_BASE_URL } from "./index"

const BASE_URL = API_BASE_URL

export async function getPosts(page = 1, pageSize = 10) {
  const response = await fetch(
    `${BASE_URL}/api/posts?page=${page}&page_size=${pageSize}`
  )

  if (!response.ok) {
    throw new Error("Failed to fetch posts")
  }

  return response.json()
}
