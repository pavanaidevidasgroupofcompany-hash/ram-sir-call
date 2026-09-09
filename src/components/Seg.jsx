function Seg({ label, value, setValue, options }) {
  return (
    <div className="seg">
      <span className="seg-lbl">{label}</span>
      <div className="seg-box">
        {options.map(([v, lbl]) => (
          <button key={v} className={"seg-btn" + (v === value ? " on" : "")} onClick={() => setValue(v)}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

export { Seg };
