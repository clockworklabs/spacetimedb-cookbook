import type { ReactNode } from "react";
import type { FetchStatus } from "../module_bindings/types";
import { FRONT_PAGE_HREF } from "../route";
import { StatusLine } from "./StatusLine";

type Props = {
  // On the front page the wordmark is the page's heading; elsewhere it's the
  // way back there.
  home?: boolean;
  isActive: boolean;
  loaded: boolean;
  status: FetchStatus | undefined;
  now: number;
  delayed: boolean;
  children?: ReactNode;
};

export function Masthead({ home = false, children, ...statusProps }: Props) {
  return (
    <header className="masthead">
      <div className="masthead-title">
        {home ? (
          <h1 className="wordmark">wikiwatch</h1>
        ) : (
          <p className="wordmark">
            <a href={FRONT_PAGE_HREF}>wikiwatch</a>
          </p>
        )}
        <p className="tagline">Wikipedia, as it’s being edited</p>
      </div>
      <div className="masthead-controls">
        <StatusLine {...statusProps} />
        {children}
      </div>
    </header>
  );
}
