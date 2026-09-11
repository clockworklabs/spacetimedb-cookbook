import { useState } from "react";
import { useSpacetimeDB } from "spacetimedb/react";
import { ArticlePage } from "./components/ArticlePage";
import { FetchToasts } from "./components/FetchToasts";
import { FrontPage } from "./components/FrontPage";
import { useFetchActivity, useLiveStore, useNow } from "./live/hooks";
import { useRoute } from "./route";

const TICK_MS = 250;

function App() {
  // The live store stays attached on every page, so the front page is ready
  // the moment you come back to it.
  const store = useLiveStore();
  const fetches = useFetchActivity();
  const { isActive } = useSpacetimeDB();
  const now = useNow(TICK_MS);
  const route = useRoute();
  // Kept here rather than on the front page, so it survives visiting an article.
  const [hideBots, setHideBots] = useState(false);

  return (
    <div className="page">
      {route.page === "article" ? (
        <ArticlePage
          key={route.pageId.toString()}
          pageId={route.pageId}
          store={store}
          isActive={isActive}
          now={now}
        />
      ) : (
        <FrontPage
          store={store}
          isActive={isActive}
          now={now}
          hideBots={hideBots}
          onHideBotsChange={setHideBots}
        />
      )}

      <footer className="colophon">
        Article summaries and images come from{" "}
        <a href="https://en.wikipedia.org/" target="_blank" rel="noreferrer">
          Wikipedia
        </a>
        . The edits are collected by a SpacetimeDB module every 15 seconds.
      </footer>

      <FetchToasts toasts={fetches} now={now} />
    </div>
  );
}

export default App;
