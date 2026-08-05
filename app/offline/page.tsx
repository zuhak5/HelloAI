import { Bot, WifiOff } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <main className="static-page offline-page">
      <div className="static-card">
        <div className="hero-mark"><Bot size={31} /></div>
        <WifiOff size={24} />
        <h1>HelloAI is offline</h1>
        <p>The installed app and previously stored conversations are available from the main screen. New AI responses require a network connection.</p>
        <Link className="primary-link" href="/">Open local chats</Link>
      </div>
    </main>
  );
}
