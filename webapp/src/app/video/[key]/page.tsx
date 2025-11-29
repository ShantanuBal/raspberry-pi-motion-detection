"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Footer from "@/components/Footer";
import Header from "@/components/Header";

export default function VideoPage() {
  const { data: session, status } = useSession();
  const params = useParams();
  const router = useRouter();
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }

    if (status === "authenticated" && params.key) {
      fetchVideo(params.key as string);
    }
  }, [status, params.key, router]);

  const fetchVideo = async (encodedKey: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/videos/${encodedKey}`);
      if (!response.ok) throw new Error("Failed to get video URL");
      const data = await response.json();
      setVideoUrl(data.url);
    } catch (err) {
      setError("Failed to load video");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Header session={session} showHomeButton={true} />

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4">
        {error ? (
          <div className="text-red-400">{error}</div>
        ) : videoUrl ? (
          <div className="w-full max-w-5xl">
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <video
                src={videoUrl}
                controls
                autoPlay
                className="w-full"
                onError={(e) => {
                  const video = e.currentTarget;
                  console.error("[video] Error:", video.error?.message, video.error?.code);
                }}
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="mt-4 text-center">
              <p className="text-gray-400 text-sm">
                Share this URL to give others access to this video
              </p>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Loading video...</div>
        )}
      </main>

      <Footer />
    </div>
  );
}
