import { NextResponse } from "next/server";

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
