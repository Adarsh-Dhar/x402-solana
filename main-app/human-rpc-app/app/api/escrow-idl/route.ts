import { NextResponse } from "next/server"
import { readFileSync } from "fs"
import { join } from "path"

export async function GET() {
  try {
    // Read the IDL file from the escrow project
    const idlPath = join(process.cwd(), "../escrow/target/idl/escrow.json")
    const idl = JSON.parse(readFileSync(idlPath, "utf-8"))

    return NextResponse.json(idl, {
      headers: {
        "Content-Type": "application/json",
      },
    })
  } catch (error: any) {
    console.error("Error reading escrow IDL:", error)
    return NextResponse.json({ error: "Failed to load escrow IDL" }, { status: 500 })
  }
}

