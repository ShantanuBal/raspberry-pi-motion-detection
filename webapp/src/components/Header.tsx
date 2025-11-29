"use client";

import { signOut } from "next-auth/react";
import { Session } from "next-auth";
import { useRouter, usePathname } from "next/navigation";

interface HeaderProps {
  session: Session | null;
  showHomeButton?: boolean;
}

export default function Header({ session, showHomeButton = false }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

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
      {!showHomeButton && (
        <div className="max-w-7xl mx-auto px-4 border-t border-gray-700">
          <div className="flex gap-1">
            <button
              onClick={() => router.push("/")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "text-white border-b-2 border-blue-500"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              All Videos
            </button>
            <button
              onClick={() => router.push("/starred")}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                pathname === "/starred"
                  ? "text-white border-b-2 border-blue-500"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4"
                fill={pathname === "/starred" ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                />
              </svg>
              Starred
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
