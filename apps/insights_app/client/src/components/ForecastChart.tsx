import { useMemo } from 'react';
import { LineChart, useChartUITokens, useThemeColors } from '@databricks/appkit-ui/react';
import { use as registerEcharts } from 'echarts/core';
import { MarkLineComponent } from 'echarts/components';
import { fmtAud, fmtCompact, fmtDay, fmtInt } from '../lib/format';

// AppKit registers the core chart set; the forecast boundary needs markLine too.
registerEcharts([MarkLineComponent]);

export interface ForecastRow {
  week: string;
  series: string;
  claims: number | string;
  claims_lower: number | string | null;
  claims_upper: number | string | null;
  benefit_paid: number | string;
  benefit_paid_lower: number | string | null;
  benefit_paid_upper: number | string | null;
}

export type ForecastMetric = 'claims' | 'benefit_paid';

/** Diagonal hatch (IBCS forecast notation) as an ECharts pattern fill. */
function makeHatch(color: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size, 0);
  ctx.moveTo(-size / 2, size / 2);
  ctx.lineTo(size / 2, -size / 2);
  ctx.moveTo(size / 2, size + size / 2);
  ctx.lineTo(size + size / 2, size / 2);
  ctx.stroke();
  return canvas;
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function ForecastChart({
  rows,
  metric,
  actualWeeks = 52,
  height = 320,
}: {
  rows: ForecastRow[];
  metric: ForecastMetric;
  actualWeeks?: number;
  height?: number;
}) {
  const ui = useChartUITokens();
  const palette = useThemeColors('categorical');
  const forecastColor = palette[0] ?? 'hsla(221, 83%, 53%, 1)';
  const actualColor = ui.axisTitle;

  const option = useMemo(() => {
    const actual = rows.filter((r) => r.series === 'actual').slice(-actualWeeks);
    const forecast = rows.filter((r) => r.series === 'forecast');
    const all = [...actual, ...forecast];
    const weeks = all.map((r) => r.week);
    const lowerKey = metric === 'claims' ? 'claims_lower' : 'benefit_paid_lower';
    const upperKey = metric === 'claims' ? 'claims_upper' : 'benefit_paid_upper';

    const actualData = all.map((r) => (r.series === 'actual' ? num(r[metric]) : null));
    const forecastData = all.map((r) => (r.series === 'forecast' ? num(r[metric]) : null));
    const lowerData = all.map((r) => (r.series === 'forecast' ? num(r[lowerKey]) : null));
    const upperData = all.map((r) => (r.series === 'forecast' ? num(r[upperKey]) : null));
    const bandData = all.map((_, i) => {
      const lo = lowerData[i];
      const hi = upperData[i];
      return lo !== null && hi !== null ? hi - lo : null;
    });
    // Join the forecast line to the last actual point.
    if (actual.length > 0) forecastData[actual.length - 1] = actualData[actual.length - 1];

    const fmt = (v: number) => (metric === 'claims' ? fmtInt(v) : fmtAud(v));
    const axisFmt = (v: number) => (metric === 'claims' ? fmtCompact(v) : fmtAud(v));
    const hatch = makeHatch(forecastColor);
    const forecastStart = forecast[0]?.week;

    return {
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      legend: {
        top: 0,
        left: 0,
        data: ['Actual', 'ai_forecast', '90% prediction interval'],
        textStyle: { color: ui.axisTitle },
        icon: 'roundRect',
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: ui.tooltipBg,
        borderColor: ui.grid,
        textStyle: { color: ui.axisTitle, fontSize: 12 },
        formatter: (params: Array<{ dataIndex: number }>) => {
          const i = params[0]?.dataIndex ?? 0;
          const head = `<b>Week of ${fmtDay(weeks[i])}</b>`;
          if (all[i]?.series === 'actual') return `${head}<br/>Actual: ${actualData[i] !== null ? fmt(actualData[i]) : '–'}`;
          const lo = lowerData[i];
          const hi = upperData[i];
          return `${head}<br/>Forecast: ${forecastData[i] !== null ? fmt(forecastData[i]) : '–'}${
            lo !== null && hi !== null ? `<br/>90% interval: ${fmt(lo)} – ${fmt(hi)}` : ''
          }`;
        },
      },
      xAxis: {
        type: 'category',
        data: weeks,
        boundaryGap: false,
        axisLine: { lineStyle: { color: ui.grid } },
        axisTick: { show: false },
        axisLabel: {
          color: ui.axisLabel,
          formatter: (v: string) => fmtDay(v).replace(/^\d+\s/, ''),
          interval: 12,
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        axisLabel: { color: ui.axisLabel, formatter: axisFmt },
        splitLine: { lineStyle: { color: ui.grid } },
      },
      series: [
        {
          name: 'Actual',
          type: 'line',
          data: actualData,
          showSymbol: false,
          smooth: false,
          lineStyle: { color: actualColor, width: 2 },
          itemStyle: { color: actualColor },
          markLine: forecastStart
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: ui.axisLabel, type: 'dotted' },
                label: { formatter: 'Forecast →', color: ui.axisLabel, position: 'insideEndTop' },
                data: [{ xAxis: forecastStart }],
              }
            : undefined,
        },
        {
          name: '_lower',
          type: 'line',
          data: lowerData,
          stack: 'interval',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          tooltip: { show: false },
          silent: true,
        },
        {
          name: '90% prediction interval',
          type: 'line',
          data: bandData,
          stack: 'interval',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          itemStyle: { color: forecastColor },
          areaStyle: hatch ? { color: { image: hatch, repeat: 'repeat' }, opacity: 1 } : { color: forecastColor, opacity: 0.15 },
          silent: true,
        },
        {
          name: 'ai_forecast',
          type: 'line',
          data: forecastData,
          showSymbol: false,
          smooth: false,
          lineStyle: { color: forecastColor, width: 2, type: 'dashed' },
          itemStyle: { color: forecastColor },
        },
      ],
    };
  }, [rows, metric, actualWeeks, ui, forecastColor, actualColor]);

  const chartData = useMemo(() => rows.map((r) => ({ week: r.week, value: num(r[metric]) ?? 0 })), [rows, metric]);

  return (
    <LineChart
      data={chartData}
      xKey="week"
      yKey="value"
      height={height}
      options={option}
      ariaLabel={`Weekly ${metric === 'claims' ? 'claims' : 'benefit paid'}: actuals and ai_forecast projection with 90% interval`}
    />
  );
}
