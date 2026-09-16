import { useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { ArticlePage } from "./components/ArticlePage";
import { DebugPanel } from "./components/DebugPanel";
import { FetchToasts } from "./components/FetchToasts";
import { DEBUG } from "./debug/enabled";
import { EditStream } from "./components/EditStream";
import { FrontPage } from "./components/FrontPage";
import { MadeWith } from "./components/MadeWith";
import { useFetchActivity, useLiveSet, useNow } from "./live/hooks";
import { useRoute } from "./route";

const TICK_MS = 250;

function App() {
  // The live set stays subscribed on every page, so the front page is ready
  // the moment you come back to it.
  const live = useLiveSet();
  const fetches = useFetchActivity();
  const { isActive } = useSpacetimeDB();
  const now = useNow(TICK_MS);
  const route = useRoute();
  // Kept here rather than on one page, so it survives moving between them.
  const [hideBots, setHideBots] = useState(false);

  return (
    <div className="page">
      {route.page === "article" ? (
        <ArticlePage
          key={route.pageId.toString()}
          pageId={route.pageId}
          live={live}
          isActive={isActive}
          now={now}
        />
      ) : route.page === "edits" ? (
        <EditStream
          live={live}
          isActive={isActive}
          now={now}
          hideBots={hideBots}
          onHideBotsChange={setHideBots}
        />
      ) : (
        <FrontPage
          live={live}
          isActive={isActive}
          now={now}
          hideBots={hideBots}
          onHideBotsChange={setHideBots}
        />
      )}

      {/* Fixed to the bottom of the window, so the badge is always in view. */}
      <footer className="colophon">
        <div className="colophon-inner">
          <p>
            Summaries and images from{" "}
            <a
              href="https://en.wikipedia.org/"
              target="_blank"
              rel="noreferrer"
            >
              Wikipedia
            </a>
          </p>
          <MadeWith />
        </div>
      </footer>

      <FetchToasts toasts={fetches} now={now} />
      {DEBUG && <DebugPanel />}
    </div>
  );
}

export default App;
