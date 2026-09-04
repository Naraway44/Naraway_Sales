export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-lg bg-black font-extrabold"
      style={{ width: size, height: size, fontSize: size * 0.52 }}
    >
      <span className="text-white">L</span>
      <span style={{ color: "#ff5a1f" }}>S</span>
    </span>
  );
}
