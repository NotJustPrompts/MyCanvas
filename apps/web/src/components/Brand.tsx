import { useTheme } from "../utils/theme";

/**
 * Brand lockup: the paintbrush mark (see brand/icon.svg — the orange capsule
 * and blob are drawn oversized and clipped by the rounded square, like the
 * source artwork) plus the "MyCanvas" wordmark in Poppins SemiBold. The
 * square goes light on the dark theme so the mark keeps its contrast.
 */
export function Brand() {
  const theme = useTheme();
  return (
    <a className="brand" href="#/" title="Back to projects">
      <svg className="brand-mark" viewBox="0 0 237 236" aria-hidden="true">
        <defs>
          <clipPath id="brand-mark-clip">
            <rect width="237" height="236" rx="45" />
          </clipPath>
        </defs>
        <rect width="237" height="236" rx="45" fill={theme === "dark" ? "#f2f4f8" : "#162231"} />
        <g clipPath="url(#brand-mark-clip)">
          <line x1="157" y1="154" x2="334" y2="-6" stroke="#fa7339" strokeWidth="57" strokeLinecap="round" />
          <path
            d="M 8 216 C 20 218 30 219 42 217 C 60 212 72 193 84 175 C 92 162 101 160 112 162 C 127 164 137 174 143 185 C 147 191 150 197 149 204 C 148 213 139 223 125 230 C 116 234 110 237 104 239 L 48 241 C 36 238 24 231 14 221 C 11 218 9 217 8 216 Z"
            fill="#fa7339"
          />
        </g>
      </svg>
      <span className="brand-name">MyCanvas</span>
    </a>
  );
}
