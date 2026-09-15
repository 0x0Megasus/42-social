import { NextResponse } from "next/server";

// GET /api/media/config -> { cloud, presetImage, presetMedia }.
// Public values by design (they ship inside client JS and upload URLs
// anyway). Single source of truth for readiness: the browser asks here at
// runtime instead of relying on build-time env inlining, so configuring
// the server takes effect with zero client rebuilds.
export async function GET() {
  const cloud = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? null;
  const presetImage = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_IMAGE ?? null;
  const presetMedia = process.env.NEXT_PUBLIC_CLOUDINARY_PRESET_MEDIA ?? null;
  return NextResponse.json(
    { cloud, presetImage, presetMedia },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
