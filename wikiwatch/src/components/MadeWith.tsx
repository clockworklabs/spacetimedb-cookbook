import spacetimedb from "../assets/spacetimedb.svg";

export function MadeWith() {
  return (
    <a
      className="made-with"
      href="https://spacetimedb.com"
      target="_blank"
      rel="noreferrer"
    >
      <span>made with</span>
      <img src={spacetimedb} width={103} height={26} alt="Spacetime" />
    </a>
  );
}
