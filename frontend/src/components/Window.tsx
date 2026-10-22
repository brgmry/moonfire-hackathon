"use client";
export function Window({ title, className = "", children, id, onClose, tip }: { title: string; className?: string; children: React.ReactNode; id?: string; onClose?: () => void; tip?: string }) {
  return (
    <section className={`win ${className}`} id={id} aria-label={title}>
      <div className="tb">
        <button type="button" className="box" aria-label={`close ${title}`} data-tip={onClose ? "close window (File > Show all windows brings it back)" : undefined} onClick={onClose} />
        <span data-tip={tip}>{title}</span>
      </div>
      <div className="body">{children}</div>
    </section>
  );
}
