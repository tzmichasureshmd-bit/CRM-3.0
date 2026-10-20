import { ImageResponse } from "next/og";
import fs from "fs";
import path from "path";

export const size = { width: 128, height: 128 };
export const contentType = "image/png";

export default function Icon() {
  const logoPath = path.join(process.cwd(), "public", "images", "logo.png");
  const logoData = fs.readFileSync(logoPath);
  const base64 = logoData.toString("base64");
  const src = `data:image/png;base64,${base64}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} width={128} height={128} style={{ objectFit: "contain" }} alt="logo" />
      </div>
    ),
    { ...size },
  );
}
