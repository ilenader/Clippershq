"use client";

import { useState } from "react";

interface CampaignImageProps {
  src?: string | null;
  name: string;
  className?: string;
}

export function CampaignImage({ src, name, className = "h-full w-full" }: CampaignImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`${className} flex items-center justify-center bg-accent/10 text-accent font-bold text-lg`}>
        {(name || "?")[0].toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={`${className} object-cover`}
      onError={() => setFailed(true)}
    />
  );
}
