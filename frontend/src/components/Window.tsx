export function Window({ title, className = "", children, id }: { title: string; className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section className={`win ${className}`} id={id} aria-label={title}>
      <div className="tb"><span className="box" aria-hidden="true" /><span>{title}</span></div>
      <div className="body">{children}</div>
    </section>
  );
}
