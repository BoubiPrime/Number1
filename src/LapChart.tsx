import { useState } from "react";
import { Activity } from "lucide-react";
import {
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  chartDomain,
  comparisonData,
  delta,
  formatTime,
  stats,
  type Lap,
  type Session,
} from "./model";

const colors = ["#00e676", "#71b7ff"];
const tick = { fill: "#8994a4", fontSize: 10 };
function useChartRange(length: number) {
  const [range, setRange] = useState({ startIndex: 0, endIndex: 39 });
  const endIndex = Math.max(0, Math.min(range.endIndex, length - 1));
  const startIndex = Math.min(range.startIndex, endIndex);
  return {
    startIndex,
    endIndex,
    onChange: (next: { startIndex?: number; endIndex?: number }) =>
      setRange((previous) => ({
        startIndex: next.startIndex ?? previous.startIndex,
        endIndex: next.endIndex ?? previous.endIndex,
      })),
  };
}

function marker(
  cx: number,
  cy: number,
  lap: Lap | undefined,
  best: number | null,
  color: string,
  showOrdinary = true,
) {
  if (!lap || (!showOrdinary && lap.valid && lap.timeMs !== best)) return <g />;
  return lap.valid ? (
    <circle
      data-lap={lap.number}
      data-valid="true"
      cx={cx}
      cy={cy}
      r={lap.timeMs === best ? 6 : 3.5}
      fill={lap.timeMs === best ? "#00e676" : "#161b22"}
      stroke={lap.timeMs === best ? "#00e676" : color}
      strokeWidth={2}
    />
  ) : (
    <path
      data-lap={lap.number}
      data-valid="false"
      d={`M${cx - 5},${cy - 5} L${cx + 5},${cy + 5} M${cx + 5},${cy - 5} L${cx - 5},${cy + 5}`}
      stroke="#fb7185"
      strokeWidth={2.5}
    />
  );
}
function LapInfo({
  lap,
  best,
  label,
}: {
  lap: Lap;
  best: number | null;
  label?: string;
}) {
  return (
    <div className="tooltip-lap">
      {label && <b>{label}</b>}
      <strong>{formatTime(lap.timeMs)}</strong>
      <span>
        {lap.valid
          ? lap.timeMs === best
            ? "Meilleur tour valide"
            : "Tour valide"
          : "Tour invalide · hors statistiques"}
      </span>
      <span>
        Écart au meilleur :{" "}
        {best === null ? "aucun tour valide" : `${delta(lap.timeMs - best)} s`}
      </span>
    </div>
  );
}
export default function LapChart({ session }: { session: Session }) {
  const best = stats(session.laps).best;
  const data = session.laps.map((l) => ({ ...l, seconds: l.timeMs / 1000 }));
  const range = useChartRange(data.length);
  const visible =
    data.length > 60 ? data.slice(range.startIndex, range.endIndex + 1) : data;
  return (
    <div
      className={`chart ${data.length > 60 ? "long-chart" : ""}`}
      role="img"
      aria-label="Évolution des chronos par tour, également disponibles dans le tableau des tours"
    >
      {data.length ? (
        <>
          <span className="axis-unit">Temps au tour (s)</span>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={data}
              margin={{ top: 32, right: 20, left: 5, bottom: 12 }}
            >
              <CartesianGrid
                stroke="#29313a"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                minTickGap={22}
                dataKey="number"
                tickLine={false}
                axisLine={false}
                tick={tick}
                label={{
                  value: "TOUR",
                  position: "insideBottomRight",
                  offset: -9,
                  fill: "#687586",
                  fontSize: 10,
                }}
              />
              <YAxis
                domain={chartDomain(visible.map((l) => l.seconds))}
                tickFormatter={(v) => Number(v).toFixed(3)}
                tickLine={false}
                axisLine={false}
                width={65}
                tick={tick}
              />
              <Tooltip
                wrapperStyle={{ maxWidth: "min(270px, calc(100vw - 50px))" }}
                content={({ active, payload }) => {
                  const lap = payload?.[0]?.payload;
                  return active && lap ? (
                    <div className="chart-tooltip">
                      Tour {lap.number}
                      <LapInfo lap={lap} best={best} />
                    </div>
                  ) : null;
                }}
              />
              {data.length > 60 && (
                <Brush
                  ariaLabel="Sélection des tours · flèches gauche et droite"
                  dataKey="number"
                  height={22}
                  {...range}
                  stroke="#536779"
                  fill="#11171e"
                  travellerWidth={10}
                />
              )}
              <Line
                isAnimationActive={false}
                type="linear"
                dataKey="seconds"
                stroke={colors[0]}
                strokeWidth={2.5}
                activeDot={{ r: 7, stroke: "#0b0f14", strokeWidth: 3 }}
                dot={(props) =>
                  marker(
                    props.cx ?? 0,
                    props.cy ?? 0,
                    props.payload,
                    best,
                    colors[0],
                    data.length <= 60,
                  )
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      ) : (
        <div className="empty">
          <Activity />
          <h3>La piste vous attend</h3>
          <p>Ajoutez un premier chrono pour voir votre progression.</p>
        </div>
      )}
    </div>
  );
}
export function ComparisonChart({ a, b }: { a: Session; b: Session }) {
  const data = comparisonData(a, b);
  const range = useChartRange(data.length);
  const visible =
    data.length > 60 ? data.slice(range.startIndex, range.endIndex + 1) : data;
  const bestA = stats(a.laps).best,
    bestB = stats(b.laps).best;
  const values = visible.flatMap((row) =>
    [row.a, row.b].filter((v): v is number => v !== null),
  );
  if (!values.length)
    return (
      <div className="empty">
        <Activity />
        <h3>Aucun chrono à comparer</h3>
        <p>Ajoutez des tours dans les sessions sélectionnées.</p>
      </div>
    );
  return (
    <div
      className="chart comparison-chart"
      role="img"
      aria-label="Comparaison des chronos des deux sessions par numéro de tour"
    >
      <span className="axis-unit">Temps au tour (s)</span>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 32, right: 20, left: 5, bottom: 12 }}
        >
          <CartesianGrid
            stroke="#29313a"
            strokeDasharray="3 5"
            vertical={false}
          />
          <XAxis
            minTickGap={22}
            dataKey="number"
            tickLine={false}
            axisLine={false}
            tick={tick}
            label={{
              value: "TOUR",
              position: "insideBottomRight",
              offset: -9,
              fill: "#687586",
              fontSize: 10,
            }}
          />
          <YAxis
            domain={chartDomain(values)}
            tickFormatter={(v) => Number(v).toFixed(3)}
            width={65}
            tickLine={false}
            axisLine={false}
            tick={tick}
          />
          <Tooltip
            wrapperStyle={{ maxWidth: "min(270px, calc(100vw - 50px))" }}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload;
              return active && row ? (
                <div className="chart-tooltip">
                  Tour {row.number}
                  {row.lapA && (
                    <LapInfo label="Session 1" lap={row.lapA} best={bestA} />
                  )}{" "}
                  {row.lapB && (
                    <LapInfo label="Session 2" lap={row.lapB} best={bestB} />
                  )}
                </div>
              ) : null;
            }}
          />
          {data.length > 60 && (
            <Brush
              ariaLabel="Sélection des tours · flèches gauche et droite"
              dataKey="number"
              height={22}
              {...range}
              stroke="#536779"
              fill="#11171e"
              travellerWidth={10}
            />
          )}
          {(["a", "b"] as const).map((key, i) => (
            <Line
              key={key}
              dataKey={key}
              name={`Session ${i + 1}`}
              type="linear"
              stroke={colors[i]}
              strokeWidth={2.5}
              connectNulls={false}
              isAnimationActive={false}
              dot={(props) =>
                marker(
                  props.cx ?? 0,
                  props.cy ?? 0,
                  props.payload?.[i === 0 ? "lapA" : "lapB"],
                  i === 0 ? bestA : bestB,
                  colors[i],
                  data.length <= 60,
                )
              }
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
