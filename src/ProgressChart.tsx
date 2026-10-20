import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from "recharts";
import { chartDomain, driverProgress, formatTime } from "./model";
type Rows = ReturnType<typeof driverProgress>["rows"];
export default function ProgressChart({ rows }: { rows: Rows }) {
  const data = rows.map((row, index) => ({
    ...row,
    index: index + 1,
    best: row.best === null ? null : row.best / 1000,
    mean: row.mean === null ? null : row.mean / 1000,
    sigma: row.deviation === null ? null : row.deviation / 1000,
  }));
  if (!data.some((r) => r.best !== null))
    return (
      <div className="empty">
        Aucun tour valide : enregistrez des chronos pour afficher la
        progression.
      </div>
    );
  return (
    <>
      <div
        className="chart progress-chart"
        role="img"
        aria-label="Évolution des meilleurs chronos et moyennes par session"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 20, right: 22, left: 10, bottom: 14 }}
          >
            <CartesianGrid
              stroke="#2a3440"
              strokeDasharray="3 5"
              vertical={false}
            />
            <XAxis
              dataKey="index"
              minTickGap={25}
              tick={{ fill: "#8799ac", fontSize: 10 }}
              label={{
                value: "SESSION",
                position: "insideBottomRight",
                offset: -8,
                fill: "#7b8b9c",
                fontSize: 9,
              }}
            />
            <YAxis
              width={66}
              tick={{ fill: "#8799ac", fontSize: 10 }}
              tickFormatter={(v) => Number(v).toFixed(3)}
              domain={chartDomain(
                data.flatMap((r) =>
                  [r.best, r.mean].filter((v): v is number => v !== null),
                ),
              )}
            />
            <Tooltip
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload;
                return active && row ? (
                  <div className="chart-tooltip">
                    {row.session.date}
                    <strong>
                      Meilleur :{" "}
                      {formatTime(row.best === null ? null : row.best * 1000)}
                    </strong>
                    <span>
                      Moyenne :{" "}
                      {formatTime(row.mean === null ? null : row.mean * 1000)}
                    </span>
                  </div>
                ) : null;
              }}
            />
            <Line
              dataKey="best"
              stroke="#00e676"
              strokeWidth={2}
              connectNulls={false}
              dot={data.length < 60}
              isAnimationActive={false}
            />
            <Line
              dataKey="mean"
              stroke="#71b7ff"
              strokeWidth={2}
              connectNulls={false}
              dot={data.length < 60}
              isAnimationActive={false}
            />
            {data.length > 60 && (
              <Brush
                dataKey="index"
                height={20}
                stroke="#738a9c"
                startIndex={0}
                endIndex={39}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend">
        <span>
          <i className="legend-line" />
          Meilleur valide
        </span>
        <span>
          <i className="legend-line blue-line" />
          Moyenne valide
        </span>
      </div>
      <div className="section-heading">
        <h2>Régularité au fil des sessions</h2>
        <span className="muted">
          Écart-type en secondes · plus faible = temps plus proches
        </span>
      </div>
      <div
        className="chart sigma-chart"
        role="img"
        aria-label="Écart-type des tours valides au fil des sessions"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 15, right: 22, left: 10, bottom: 12 }}
          >
            <CartesianGrid
              stroke="#2a3440"
              strokeDasharray="3 5"
              vertical={false}
            />
            <XAxis
              dataKey="index"
              minTickGap={25}
              tick={{ fill: "#8799ac", fontSize: 10 }}
            />
            <YAxis
              width={66}
              tick={{ fill: "#8799ac", fontSize: 10 }}
              tickFormatter={(v) => Number(v).toFixed(3)}
            />
            <Tooltip
              formatter={(v) => [`${Number(v).toFixed(3)} s`, "Écart-type"]}
              labelFormatter={(index) => `Session ${index}`}
            />
            <Line
              dataKey="sigma"
              stroke="#b39afa"
              strokeWidth={2}
              dot={data.length < 60}
              connectNulls={false}
              isAnimationActive={false}
            />
            {data.length > 60 && (
              <Brush
                dataKey="index"
                height={20}
                stroke="#738a9c"
                startIndex={0}
                endIndex={39}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
