"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function DataRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/csv");
  }, [router]);

  return (
    <main className="px-6 py-8">
      <p className="text-base text-muted-ink">
        下载页已移至{" "}
        <Link href="/csv" className="text-primary hover:underline">
          CSV
        </Link>
        。
      </p>
    </main>
  );
}
