import { useEffect } from "react"

console.log("HOME FILE LOADED")

function Home() {
  console.log("HOME RENDER")

  useEffect(() => {
    console.log("USE EFFECT RUN")
  }, [])

  return <div>HOME OK</div>
}

export default Home