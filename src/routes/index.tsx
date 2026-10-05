import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TXT: FLOOR ZERO — Zombie Survival Game" },
      { name: "description", content: "A pixel-art survival horror game: rescue your friends from a zombie-infested building and escape alive." },
      { property: "og:title", content: "TXT: FLOOR ZERO — Zombie Survival Game" },
      { property: "og:description", content: "Rescue Taehyun, Beomgyu, Soobin and Kai from a zombie-infested building." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

// The game itself lives as plain HTML/CSS/JS in public/floor-zero/.
function Index() {
  const ref = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    ref.current?.contentWindow?.focus();
  }, []);
  return (
    <iframe
      ref={ref}
      src="/floor-zero/index.html"
      title="TXT: FLOOR ZERO"
      className="fixed inset-0 h-full w-full border-0 bg-background"
      onLoad={(e) => e.currentTarget.contentWindow?.focus()}
    />
  );
}
