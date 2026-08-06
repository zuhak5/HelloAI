"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="static-page">
      <div className="static-card" role="alert">
        <span className="danger-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
        <h1>HelloAI could not open</h1>
        <p>The route encountered an unexpected error. Your browser-stored conversations have not been deleted.</p>
        <button className="primary-button" onClick={reset}><RotateCcw size={17} /> Try again</button>
      </div>
    </main>
  );
}
