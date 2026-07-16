"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { SnapshotView } from "@/components/readiness/SnapshotView";
import { readinessContent } from "@/content/readiness";

export function SnapshotPageClient() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id")?.trim() || "";

  if (!id) {
    return (
      <div className="card mt-8" data-testid="snapshot-missing-id">
        <p className="font-semibold text-ink">{readinessContent.snapshot.notFound}</p>
        <p className="mt-2 text-sm text-muted">
          Open a snapshot link that includes an id, or run the readiness check again.
        </p>
        <Link href="/readiness" className="btn-primary mt-4 inline-flex">
          Start a readiness check
        </Link>
      </div>
    );
  }

  return <SnapshotView snapshotId={id} />;
}
