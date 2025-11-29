"use client";

import { signOut } from "next-auth/react";
import { Session } from "next-auth";
import { useRouter } from "next/navigation";

interface HeaderProps {
  session: Session | null;
  showHomeButton?: boolean;
}

export default function Header({ session, showHomeButton = false }: HeaderProps) {
  const router = useRouter();

  return (
    <header className="bg-gray-800 border-b border-gray-700">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center">
        <div className="flex items-center gap-4 flex-1">
          {showHomeButton && (
            <button
              onClick={() => router.push("/")}
              className="text-gray-400 hover:text-white flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span>Back to Videos</span>
            </button>
          )}
        </div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2 absolute left-1/2 transform -translate-x-1/2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
          Shantanu&apos;s Home Motion Detector
        </h1>
        <div className="flex items-center gap-4 flex-1 justify-end">
          <span className="text-gray-400 text-sm">{session?.user?.email}</span>
          <button
            onClick={() => signOut()}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
