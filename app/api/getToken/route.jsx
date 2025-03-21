import { AssemblyAI } from "assemblyai";
import { NextResponse } from "next/server";

// Log the API key length (not the actual key) to verify it's being loaded
console.log(
  "AssemblyAI API Key length:",
  process.env.ASSEMBLY_API_KEY?.length || 0
);

const assemblyAi = new AssemblyAI({ apiKey: process.env.ASSEMBLY_API_KEY });

export async function GET(req) {
  try {
    if (!process.env.ASSEMBLY_API_KEY) {
      console.error("AssemblyAI API key is not configured");
      return NextResponse.json(
        {
          error: "API key not configured",
          details: "Please check your environment variables",
        },
        { status: 500 }
      );
    }

    // Return the API key directly since we'll use it for standard transcription
    return NextResponse.json({ apiKey: process.env.ASSEMBLY_API_KEY });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to get API key",
        details: "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
