import github from "../assets/github.svg";

export function SourceLink() {
  return (
    <a
      className="source-link"
      href="https://github.com/clockworklabs/spacetimedb-cookbook/tree/master/wikiwatch"
      target="_blank"
      rel="noreferrer"
    >
      <img src={github} width={24} height={24} alt="Source code" />
    </a>
  );
}
