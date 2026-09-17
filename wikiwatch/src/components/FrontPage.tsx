import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  editsPerMinute,
  heatOf,
  rankArticles,
  REPLAY_DELAY_MS,
  revealedCount,
  WINDOW_MS,
  type ReplayEdit,
} from "../replay";
import { ARGUMENTS_HREF, EDITS_HREF } from "../route";
import type { LiveSet } from "../subscriptions";
import { ArticleCard, type CardSize } from "./ArticleCard";
import { HideBotsToggle } from "./HideBotsToggle";
import { Masthead } from "./Masthead";
import { PulseRibbon } from "./PulseRibbon";
import { TrailLegend } from "./TrailLegend";
import { Ticker } from "./Ticker";

const RERANK_EVERY_MS = 10_000;
// The ranking is shown in tiers of shrinking cards, so articles visibly climb
// from the crowd of minis at the bottom towards the lead.
const TIERS: { size: CardSize; count: number }[] = [
  { size: "lead", count: 1 },
  { size: "medium", count: 4 },
  { size: "standard", count: 20 },
  { size: "mini", count: 75 },
];
const CARD_COUNT = TIERS.reduce((total, tier) => total + tier.count, 0);
const TICKER_LENGTH = 80;
const WINDOW_MINUTES = WINDOW_MS / 60_000;

type Props = {
  live: LiveSet;
  isActive: boolean;
  now: number;
  hideBots: boolean;
  onHideBotsChange: (hideBots: boolean) => void;
};

export function FrontPage({
  live,
  isActive,
  now,
  hideBots,
  onHideBotsChange,
}: Props) {
  const clock = now - REPLAY_DELAY_MS;

  const replay = live.replay;
  const edits = useMemo(
    () =>
      hideBots ? replay.all.filter(({ edit }) => !edit.isBot) : replay.all,
    [replay, hideBots],
  );
  const revealed = revealedCount(edits, clock);
  const order = useArticleOrder(edits, clock, CARD_COUNT, RERANK_EVERY_MS);

  const cards = order
    .map((key) => {
      const pageEdits = (replay.byPage.get(key) ?? []).filter(
        ({ edit, at, revealAt }) =>
          revealAt <= clock &&
          at >= clock - WINDOW_MS &&
          !(hideBots && edit.isBot),
      );
      return { key, edits: pageEdits, heat: heatOf(pageEdits, clock) };
    })
    .filter((card) => card.edits.length > 0);
  const hottest = Math.max(0, ...cards.map((card) => card.heat));

  let tierStart = 0;
  const tiers = TIERS.map(({ size, count }) => {
    const start = tierStart;
    tierStart += count;
    return { size, start, cards: cards.slice(start, start + count) };
  }).filter((tier) => tier.cards.length > 0);

  const latest: ReplayEdit[] = [];
  for (let i = revealed - 1; i >= 0 && latest.length < TICKER_LENGTH; i--) {
    latest.push(edits[i]);
  }

  const emptyMessage = live.isLoaded
    ? `No edits in the last ${WINDOW_MINUTES} minutes yet. They’ll appear shortly.`
    : "Loading the latest edits…";

  return (
    <>
      <Masthead
        home
        isActive={isActive}
        loaded={live.isLoaded}
        status={live.status}
        now={now}
        delayed
      >
        {live.isLoaded && (
          <PulseRibbon
            counts={editsPerMinute(edits, revealed, clock, WINDOW_MINUTES)}
          />
        )}
        <HideBotsToggle hideBots={hideBots} onChange={onHideBotsChange} />
      </Masthead>

      <main className="layout">
        <section aria-labelledby="articles-heading">
          <div className="section-head">
            {/* The front page is the first tab; the arguments page is the other. */}
            <nav className="tabs" aria-label="Views">
              <h2 id="articles-heading" className="tab current">
                Most active
              </h2>
              <a className="tab" href={ARGUMENTS_HREF}>
                Arguments
              </a>
            </nav>
            <TrailLegend />
          </div>
          {cards.length === 0 ? (
            <p className="empty">{emptyMessage}</p>
          ) : (
            <div className="tiers">
              {tiers.map((tier) => (
                <ol
                  key={tier.size}
                  className={`cards ${tier.size}-tier`}
                  start={tier.start + 1}
                >
                  {tier.cards.map((card, i) => (
                    <ArticleCard
                      key={card.key}
                      pageKey={card.key}
                      rank={tier.start + i + 1}
                      edits={card.edits}
                      preview={live.previews.get(card.key)}
                      size={tier.size}
                      heatShare={hottest > 0 ? card.heat / hottest : 0}
                      clock={clock}
                      now={now}
                    />
                  ))}
                </ol>
              ))}
            </div>
          )}
        </section>

        <aside className="rail" aria-labelledby="latest-heading">
          <div className="section-head">
            <h2 id="latest-heading">Latest edits</h2>
            <a className="section-link" href={EDITS_HREF}>
              Every edit →
            </a>
          </div>
          {latest.length === 0 ? (
            <p className="empty">{emptyMessage}</p>
          ) : (
            <Ticker edits={latest} clock={clock} />
          )}
        </aside>
      </main>
    </>
  );
}

type DocumentWithTransitions = Document & {
  startViewTransition?: (update: () => void) => { ready: Promise<void> };
};

// The ranked order of article cards. Re-ranked every `everyMs` (or when the
// edits change) rather than on every tick, so cards don't jostle constantly,
// and animated with a view transition where the browser supports one.
export function useArticleOrder(
  edits: ReplayEdit[],
  clock: number,
  limit: number,
  everyMs: number,
): string[] {
  const [order, setOrder] = useState<string[]>([]);
  const bucket = Math.floor(clock / everyMs);

  useEffect(() => {
    const next = rankArticles(
      edits,
      revealedCount(edits, clock),
      clock,
      limit,
    ).map((rank) => rank.key);
    if (sameOrder(order, next)) return;

    const doc = document as DocumentWithTransitions;
    const animate =
      order.length > 0 &&
      doc.startViewTransition !== undefined &&
      document.visibilityState === "visible" &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (animate) {
      const transition = doc.startViewTransition!(() =>
        flushSync(() => setOrder(next)),
      );
      // A skipped transition (the tab was hidden mid-way, or a newer one
      // superseded it) rejects `ready`, but its update still runs, so only
      // the animation is lost.
      transition.ready.catch(() => {});
    } else {
      setOrder(next);
    }
    // Deliberately keyed on the bucket, not the ever-moving clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, bucket, limit]);

  return order;
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}
