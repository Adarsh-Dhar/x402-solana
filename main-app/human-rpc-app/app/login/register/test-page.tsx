"use client"

export default function TestPage() {
  console.log("[TestPage] RENDERING")
  
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Test Page</h1>
      <p>If you can see this, React is working fine.</p>
      <button 
        onClick={() => {
          console.log("[TestPage] Button clicked")
          alert("Button works!")
        }}
        className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
      >
        Test Button
      </button>
    </div>
  )
}