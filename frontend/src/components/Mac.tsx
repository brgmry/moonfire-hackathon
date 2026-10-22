/* The compact Macintosh. mac.svg is generated in assets/avatars; its screen rect is 18% / 10% / 64% / 36.67% of the frame. */
export function MacFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="macwrap" aria-label="A compact Macintosh. Its screen shows the sandbox: a treemap of the repo and the agents working on it.">
      <img src="/avatars/mac.svg" alt="" width={400} height={480} draggable={false} />
      {children}
    </div>
  );
}
