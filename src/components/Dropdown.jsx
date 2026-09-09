import { useState, useEffect, useRef } from "react";

function Dropdown({ label, value, options, onChange, width }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", h); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, []);
  const cur = options.find((o) => o[0] === value);
  return (
    <div className="mpick" ref={ref} style={width ? { "--mpw": width + "px" } : undefined}>
      <button className={"mpick-btn" + (open ? " open" : "")} onClick={() => setOpen(!open)}>
        <span className="mpick-lbl">{label}</span>
        <span className="mpick-val">{cur ? cur[1] : value}</span>
        <span className="mpick-caret">▾</span>
      </button>
      {open && (
        <div className="mpick-pop">
          {options.map(([v, l]) => (
            <button key={v} className={"mpick-opt" + (v === value ? " active" : "")}
              onClick={() => { onChange(v); setOpen(false); }}>{l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export { Dropdown };
