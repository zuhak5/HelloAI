import Link from "next/link";

export default function NotFound() {
  return (
    <main className="static-page">
      <div className="static-card">
        <h1>Page not found</h1>
        <p>The requested HelloAI page does not exist.</p>
        <Link className="primary-link" href="/">Return to chat</Link>
      </div>
    </main>
  );
}
