export function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <div className="step-progress" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={index < current ? "active" : ""}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
