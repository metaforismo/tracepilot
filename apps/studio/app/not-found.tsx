import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { StudioShell } from "../components/StudioShell";

export default function NotFound() {
  return (
    <StudioShell icon={<SearchX size={18} />} subtitle="Not found">
      <div className="emptyState">
        <span className="eyebrow">404</span>
        <h1>Page not found</h1>
        <p>The trace, scorecard, or route you requested is not available in this Studio workspace.</p>
        <div className="buttonRow">
          <Link className="primaryButton" href="/">
            <ArrowLeft size={15} />
            Back to overview
          </Link>
          <Link className="ghostButton" href="/runs/smoke-form">
            Open smoke-form trace
          </Link>
        </div>
      </div>
    </StudioShell>
  );
}