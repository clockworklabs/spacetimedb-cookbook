type Props = {
  hideBots: boolean;
  onChange: (hideBots: boolean) => void;
};

export function HideBotsToggle({ hideBots, onChange }: Props) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={hideBots}
        onChange={(event) => onChange(event.target.checked)}
      />
      Hide bot edits
    </label>
  );
}
