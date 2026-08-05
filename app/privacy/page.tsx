import { ArrowLeft, HardDrive, Server, ShieldCheck } from "lucide-react";

export const metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="static-page">
      <article className="privacy-card">
        <a className="back-link" href="/"><ArrowLeft size={17} /> Back to HelloAI</a>
        <p className="eyebrow">Privacy model</p>
        <h1>Local-first by design</h1>
        <p className="lead">HelloAI has no account system and no application database. Conversations, images, drafts, and preferences are saved in browser-managed storage on this device.</p>
        <section><HardDrive size={22} /><div><h2>Stored locally</h2><p>Chats use IndexedDB. Small interface settings use localStorage. Clearing this site’s browser data removes them. Export a backup before changing devices or browser profiles.</p></div></section>
        <section><Server size={22} /><div><h2>Processed remotely</h2><p>When you send a message, its required conversation context and selected images pass through a stateless Vercel proxy to the HomePilot gateway and the selected AI provider. The proxy deliberately stores no chat content.</p></div></section>
        <section><ShieldCheck size={22} /><div><h2>Credentials protected</h2><p>Gateway credentials remain server-side. They are not included in the PWA, browser storage, exported conversations, or service-worker cache.</p></div></section>
        <h2>Important limits</h2>
        <ul>
          <li>Private browsing, browser eviction, site-data clearing, or device loss can remove local conversations.</li>
          <li>There is no cloud restore, password recovery, or cross-device synchronization.</li>
          <li>Infrastructure providers may retain normal security and operational logs under their own policies.</li>
          <li>AI outputs may be inaccurate. Do not rely on them as the sole basis for high-stakes decisions.</li>
        </ul>
      </article>
    </main>
  );
}
