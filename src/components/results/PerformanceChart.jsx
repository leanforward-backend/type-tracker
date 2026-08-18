import { useMemo, useState } from "react";

// Validated against the #161616 card surface with the dataviz palette checker:
// lightness band, chroma floor, CVD separation and contrast all pass.
const COLOR_WPM = "#00a6b8";
const COLOR_RAW = "#a855f7";
const COLOR_ERROR = "#ef4444";
const SURFACE = "#161616";

const VIEW_W = 800;
const VIEW_H = 280;
const PAD = { top: 24, right: 56, bottom: 34, left: 46 };
const PLOT_L = PAD.left;
const PLOT_R = VIEW_W - PAD.right;
const PLOT_T = PAD.top;
const PLOT_B = VIEW_H - PAD.bottom;

/** Rounds the axis ceiling up to a readable step so gridlines land on whole numbers. */
function niceCeiling(value) {
  if (value <= 20) return 20;
  const step = value > 200 ? 50 : value > 100 ? 25 : 10;
  return Math.ceil(value / step) * step;
}

/**
 * Builds a smooth Catmull-Rom or cubic Bezier spline path through data points
 * to prevent jagged 1-second interval spikes and make trends easy to read.
 */
function buildSmoothPath(points) {
  if (!points || points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x} ${points[0].y}`;
  if (points.length === 2)
    return `M${points[0].x} ${points[0].y} L${points[1].x} ${points[1].y}`;

  let path = `M${points[0].x} ${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    // Catmull-Rom to Cubic Bezier conversion (alpha = 0.5 / tension = 0.2)
    const tension = 0.15;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    path += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }

  return path;
}

export default function PerformanceChart({ timeline }) {
  const [hovered, setHovered] = useState(null);

  const { yMax, avgWpm, ticks, wpmPath, rawPath, xFor, yFor } = useMemo(() => {
    const peak = timeline.reduce(
      (max, point) => Math.max(max, point.raw, point.wpm),
      0
    );
    const max = niceCeiling(peak);
    const count = timeline.length;

    const x = (i) =>
      count <= 1
        ? (PLOT_L + PLOT_R) / 2
        : PLOT_L + (i / (count - 1)) * (PLOT_R - PLOT_L);
    const y = (value) => PLOT_B - (value / max) * (PLOT_B - PLOT_T);

    const toSmoothPath = (key) => {
      const coords = timeline.map((point, i) => ({
        x: x(i),
        y: y(point[key]),
      }));
      return buildSmoothPath(coords);
    };

    const totalWpm = timeline.reduce((acc, point) => acc + point.wpm, 0);
    const avg = count > 0 ? Math.round(totalWpm / count) : 0;

    return {
      yMax: max,
      avgWpm: avg,
      ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f)),
      wpmPath: toSmoothPath("wpm"),
      rawPath: toSmoothPath("raw"),
      xFor: x,
      yFor: y,
    };
  }, [timeline]);

  // Label roughly six seconds along the axis rather than every one, so the
  // labels never collide on a long race.
  const xLabelStep = Math.max(1, Math.ceil(timeline.length / 6));
  const errorPoints = timeline.filter((point) => point.errors > 0);

  const handleMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * VIEW_W;
    const span = PLOT_R - PLOT_L;
    const index = Math.round(
      ((svgX - PLOT_L) / span) * Math.max(1, timeline.length - 1)
    );
    setHovered(Math.max(0, Math.min(timeline.length - 1, index)));
  };

  const hoveredPoint = hovered === null ? null : timeline[hovered];

  return (
    <div className="chart-block">
      <div className="chart-legend">
        <span className="chart-legend-item">
          <span
            className="chart-swatch"
            style={{ background: COLOR_WPM }}
            aria-hidden="true"
          />
          wpm
        </span>
        <span className="chart-legend-item">
          <span
            className="chart-swatch"
            style={{ background: COLOR_RAW }}
            aria-hidden="true"
          />
          raw
        </span>
        <span className="chart-legend-item">
          <span
            className="chart-swatch"
            style={{
              background: "transparent",
              borderTop: "2px dashed #00f2ff",
              borderRadius: 0,
              height: 0,
              width: 16,
            }}
            aria-hidden="true"
          />
          avg
        </span>
        <span className="chart-legend-item">
          <svg width="12" height="12" aria-hidden="true">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke={COLOR_ERROR}
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          errors
        </span>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="chart-svg"
        role="img"
        aria-label={`Typing speed over time. Peak raw speed ${yMax} words per minute.`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHovered(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PLOT_L}
              x2={PLOT_R}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="var(--bg-input)"
              strokeWidth="1"
            />
            <text
              x={PLOT_L - 10}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="chart-axis-text"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* Dashed Average WPM Reference Line */}
        {avgWpm > 0 && (
          <g>
            <line
              x1={PLOT_L}
              x2={PLOT_R}
              y1={yFor(avgWpm)}
              y2={yFor(avgWpm)}
              stroke="#00f2ff"
              strokeWidth="1.5"
              strokeDasharray="5,4"
              strokeOpacity="0.75"
            />
            <text
              x={PLOT_R + 8}
              y={yFor(avgWpm) + 4}
              className="chart-series-label"
              fill="#00f2ff"
              opacity="0.8"
              fontSize="10"
            >
              avg {avgWpm}
            </text>
          </g>
        )}

        {timeline.map((point, i) =>
          i % xLabelStep === 0 || i === timeline.length - 1 ? (
            <text
              key={point.second}
              x={xFor(i)}
              y={PLOT_B + 20}
              textAnchor="middle"
              className="chart-axis-text"
            >
              {point.second}s
            </text>
          ) : null
        )}

        <path
          d={rawPath}
          fill="none"
          stroke={COLOR_RAW}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={wpmPath}
          fill="none"
          stroke={COLOR_WPM}
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {errorPoints.map((point) => {
          const cx = xFor(point.second - 1);
          const cy = yFor(point.wpm);
          return (
            <g key={`err-${point.second}`}>
              {/* Surface-coloured ring so the marker stays legible where it sits on a line */}
              <circle r="6" cx={cx} cy={cy} fill={SURFACE} />
              <path
                d={`M${cx - 4} ${cy - 4} L${cx + 4} ${cy + 4} M${cx + 4} ${cy - 4} L${cx - 4} ${cy + 4}`}
                stroke={COLOR_ERROR}
                strokeWidth="2"
                strokeLinecap="round"
              />
            </g>
          );
        })}

        {/* Direct labels at the line ends, so identity never depends on the legend alone */}
        {timeline.length > 0 && (
          <>
            <text
              x={PLOT_R + 8}
              y={yFor(timeline[timeline.length - 1].wpm) + 4}
              className="chart-series-label"
              fill={COLOR_WPM}
            >
              wpm
            </text>
            <text
              x={PLOT_R + 8}
              y={yFor(timeline[timeline.length - 1].raw) + 4}
              className="chart-series-label"
              fill={COLOR_RAW}
            >
              raw
            </text>
          </>
        )}

        {hoveredPoint && (
          <g pointerEvents="none">
            <line
              x1={xFor(hovered)}
              x2={xFor(hovered)}
              y1={PLOT_T}
              y2={PLOT_B}
              stroke="var(--text-muted)"
              strokeWidth="1"
            />
            <circle
              cx={xFor(hovered)}
              cy={yFor(hoveredPoint.raw)}
              r="4"
              fill={COLOR_RAW}
              stroke={SURFACE}
              strokeWidth="2"
            />
            <circle
              cx={xFor(hovered)}
              cy={yFor(hoveredPoint.wpm)}
              r="4"
              fill={COLOR_WPM}
              stroke={SURFACE}
              strokeWidth="2"
            />
            <g
              transform={`translate(${Math.min(
                xFor(hovered) + 12,
                PLOT_R - 118
              )}, ${PLOT_T + 6})`}
            >
              <rect
                width="132"
                height="66"
                rx="6"
                fill={SURFACE}
                stroke="var(--bg-input)"
              />
              <text x="10" y="20" className="chart-tooltip-title">
                {hoveredPoint.second}s
              </text>
              <text x="10" y="38" className="chart-tooltip-row">
                wpm {hoveredPoint.wpm}
              </text>
              <text x="10" y="54" className="chart-tooltip-row">
                raw {hoveredPoint.raw} · errors {hoveredPoint.errors}
              </text>
            </g>
          </g>
        )}
      </svg>

      <details className="chart-table">
        <summary>View as table</summary>
        <div className="chart-table-scroll">
          <table>
            <thead>
              <tr>
                <th>second</th>
                <th>wpm</th>
                <th>raw</th>
                <th>errors</th>
              </tr>
            </thead>
            <tbody>
              {timeline.map((point) => (
                <tr key={point.second}>
                  <td>{point.second}</td>
                  <td>{point.wpm}</td>
                  <td>{point.raw}</td>
                  <td>{point.errors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
