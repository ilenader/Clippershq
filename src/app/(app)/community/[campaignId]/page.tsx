"use client";
import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";

export default function CommunityRedirect() {
  const router = useRouter();
  const params = useParams();
  const campaignId = params?.campaignId as string;

  useEffect(() => {
    router.replace(`/community?campaignId=${encodeURIComponent(campaignId || "")}`);
  }, [router, campaignId]);

  return null;
}
