import { consistency, formatTime, sectorStats } from "../src/model";
import { AnalysisError, performances, priorities, record, type AnalysisInput, type AnalysisResult, type Performance, type Priority } from "../src/ai/contracts";

export function evidence(input: AnalysisInput) {
  const laps = input.laps.map((lap, i) => ({ ...lap, number: i + 1, id: String(i) }));
  const data = consistency(laps);
  const sectors = sectorStats(laps);
  // validateInput guarantees >= 3 valid laps. No comparison with other tracks or drivers.
  const best = data.best!, mean = data.mean!, deviation = data.deviation!;
  const cvPercent = deviation / mean * 100;
  const consistencyScore = Math.round(Math.max(0, Math.min(100, 100 - 20 * cvPercent)));
  const averageGapPercent = (mean - best) / best * 100;
  const invalidCount = laps.length - data.count;
  const seconds = (ms: number) => (ms / 1000).toFixed(3).replace(".", ",");
  const tips: Record<string, string> = {
    repeat_run: "Refaites un relais de cinq tours valides avec la même voiture et la même configuration de circuit.",
    compare_context: "Comparez ce relais à une session du même jeu, sur le même tracé et avec la même voiture.",
    target_mean: `Visez d’abord cinq tours proches de votre moyenne actuelle (${formatTime(mean)}), puis comparez leur dispersion.`,
    inspect_gaps: "Repérez vos plus grands écarts de chrono dans le graphique avant de choisir un objectif pour le prochain relais.",
  };
  if (invalidCount) tips.valid_laps = "Cherchez un relais de cinq tours tous valides avant de viser un nouveau meilleur chrono.";
  if (data.count < 10) tips.more_laps = "Enregistrez au moins dix tours valides pour vérifier si cette régularité se confirme sur un relais plus long.";
  if (sectors.completeCount < data.count) tips.add_sectors = "Renseignez les trois secteurs de vos prochains tours pour localiser les écarts de temps.";
  if (sectors.gap !== null && sectors.gap > 0) tips.repeat_sectors = "Comparez vos secteurs valides et cherchez à répéter leurs meilleurs temps dans un même tour.";
  if (data.paceChange !== null && data.paceChange > 0) tips.end_pace = "Comparez vos tours de début et de fin de relais ; notez les conditions avant d’attribuer le ralentissement à une cause.";
  const availablePriorities = priorities.filter((p) => p !== "Validité des tours" || invalidCount > 0)
    .filter((p) => p !== "Secteurs" || (sectors.gap !== null && sectors.gap > 0));
  const findings: Record<Priority, string> = {
    Rythme: `L’écart moyen au meilleur tour est de ${seconds(mean - best)} s, sans référence extérieure pour juger votre vitesse absolue.`,
    Régularité: `L’écart entre votre meilleur et votre moins bon tour valide est de ${seconds(data.spread!)} s.`,
    "Validité des tours": `${invalidCount} tour(s) invalide(s) sont exclus des calculs de chronos ; leur cause n’est pas enregistrée.`,
    Secteurs: `Sur les ${sectors.completeCount} tours valides avec secteurs, l’idéal théorique est ${formatTime(sectors.ideal)}, sans garantie de le réaliser.`,
  };
  return {
    consistencyScore, tips, availablePriorities, findings,
    opening: `Sur ${data.count} tours valides parmi ${laps.length}, votre meilleur chrono est ${formatTime(best)} et votre moyenne ${formatTime(mean)}.`,
    regularity: `L’écart-type est de ${seconds(deviation)} s ; le score descriptif de régularité est ${consistencyScore}/100.`,
    facts: {
      context: { circuit: input.circuit, layout: input.layout || null, car: input.car, game: input.game, type: input.type, demo: input.demo },
      totalLaps: laps.length, validLaps: data.count, invalidLaps: invalidCount,
      bestMs: best, meanMs: mean, deviationMs: deviation, spreadMs: data.spread,
      averageGapMs: mean - best, averageGapPercent, cvPercent, consistencyScore,
      validPercent: data.validPercent,
      pace: { blockSize: data.blockSize, startMeanMs: data.startMean, endMeanMs: data.endMean, changeMs: data.paceChange },
      sectors: { completeValidLaps: sectors.completeCount, bestMs: sectors.best, idealMs: sectors.ideal, realMinusIdealMs: sectors.gap },
      unavailable: ["freinage", "trajectoire", "vitesse", "pneus", "carburant", "météo", "position ou résultat", "niveau des autres pilotes"],
    },
  };
}
export type Evidence = ReturnType<typeof evidence>;
export interface Selection {
  performance: Performance;
  priority: Priority;
  tipIds: [string, string, string];
}
export function validateSelection(value: unknown, data: Evidence): Selection {
  if (!record(value) || !performances.includes(value.performance as Performance) ||
    !data.availablePriorities.includes(value.priority as Priority) || !Array.isArray(value.tipIds) ||
    value.tipIds.length !== 3 || new Set(value.tipIds).size !== 3 ||
    !value.tipIds.every((id) => typeof id === "string" && Object.hasOwn(data.tips, id)))
    throw new AnalysisError("invalid_response", 502, "L’IA a renvoyé une analyse inexploitable. Vous pouvez réessayer.");
  return { performance: value.performance as Performance, priority: value.priority as Priority, tipIds: value.tipIds as Selection["tipIds"] };
}
export function assembleResult(data: Evidence, selected: Selection, provider: AnalysisResult["provider"]): AnalysisResult {
  return {
    version: 1, performance: selected.performance, priority: selected.priority,
    consistencyScore: data.consistencyScore,
    summary: [data.opening, data.regularity, data.findings[selected.priority]].join(" "),
    tips: selected.tipIds.map((id) => data.tips[id]) as AnalysisResult["tips"],
    validLaps: data.facts.validLaps, totalLaps: data.facts.totalLaps,
    analyzedAt: new Date().toISOString(), provider,
  };
}
