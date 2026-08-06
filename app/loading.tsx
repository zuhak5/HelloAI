import { Bot } from "lucide-react";

export default function Loading() {
  return (
    <main className="static-page" aria-busy="true" aria-live="polite">
      <div className="static-card">
        <div className="hero-mark" aria-hidden="true"><Bot size={31} /></div>
        <h1>Opening HelloAI</h1>
        <p>Loading the local workspace and preparing your conversations.</p>
      </div>
    </main>
  );
}
