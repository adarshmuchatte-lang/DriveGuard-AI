import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAiPipelineQueryKey,
  getGetAnalyticsQueryKey,
  getGetDemoScenariosQueryKey,
  getGetDriverStateQueryKey,
  getGetRoadContextQueryKey,
  getGetRiskQueryKey,
  getGetRiskTimelineQueryKey,
  getGetSystemStatusQueryKey,
  getHealthCheckQueryKey,
  useGetAiPipeline,
  useGetAnalytics,
  useGetDemoScenarios,
  useGetDriverState,
  useGetRoadContext,
  useGetRisk,
  useGetRiskTimeline,
  useGetSystemStatus,
  useHealthCheck,
  useSelectDemoScenario,
} from '@workspace/api-client-react';

const fallbackRisk = {
  riskScore: 68,
  riskLevel: 'HIGH',
  driver: { phoneUsage: 61, drowsiness: 38, gazeAway: 54, yawning: 27, distraction: 59, posture: 44 },
  road: {
    laneDeviation: 0.42, nearbyVehicles: 7, trafficDensity: 'HEAVY', speed: 58, acceleration: 0.18,
    braking: 'MODERATE', laneOffset: 0.31, vehicles: [
      { id: 'car-a', x: 48, y: 28, distance: 22, lane: 'center' },
      { id: 'car-b', x: 20, y: 43, distance: 36, lane: 'left' },
      { id: 'car-c', x: 72, y: 54, distance: 44, lane: 'right' },
    ],
    vehicle: { hardBraking: false, acceleration: 0.18, speed: 58, gear: 'D' },
  },
  reasons: ['Phone interaction detected', 'Frequent gaze diversion', 'Dense traffic context'],
  factors: [
    { label: 'Distraction', value: 59, color: '#e0a039', category: 'driver' },
    { label: 'Gaze away', value: 54, color: '#e0a039', category: 'driver' },
    { label: 'Traffic density', value: 48, color: '#d8664e', category: 'road' },
    { label: 'Lane stability', value: 35, color: '#4e9a9a', category: 'vehicle' },
  ],
  contextualFactors: [
    { label: 'Distracted + dense traffic', description: 'Attention loss is amplified by seven nearby vehicles.', impact: 26, severity: 'HIGH' },
    { label: 'Gaze away + lane drift', description: 'Visual disengagement is persisting while lane offset grows.', impact: 18, severity: 'MODERATE' },
    { label: 'Speed + moderate braking', description: 'Vehicle state adds a smaller but persistent contribution.', impact: 9, severity: 'LOW' },
  ],
  updatedAt: new Date().toISOString(),
};

const fallbackDriver = {
  status: 'ATTENTION_DEGRADED',
  metrics: fallbackRisk.driver,
  signals: [
    { key: 'gaze', label: 'Gaze direction', state: 'AWAY', confidence: 0.91, trend: 'rising' },
    { key: 'phone', label: 'Phone interaction', state: 'DETECTED', confidence: 0.86, trend: 'steady' },
    { key: 'blink', label: 'Blink cadence', state: 'NORMAL', confidence: 0.78, trend: 'stable' },
    { key: 'posture', label: 'Posture', state: 'FORWARD', confidence: 0.73, trend: 'improving' },
  ],
};

const fallbackRoad = fallbackRisk.road;
const fallbackStatus = { camera: 'CONNECTED', aiEngine: 'ONLINE', backend: 'ONLINE', fps: 28, inferenceLatency: 42, confidence: 0.91, demoMode: true };
const fallbackTimeline = [
  { id: 'e1', time: '14:32:08', title: 'Phone interaction', detail: 'Right hand below steering wheel', severity: 'HIGH' },
  { id: 'e2', time: '14:31:41', title: 'Lane deviation', detail: 'Offset reached 0.42 m over 3.8 seconds', severity: 'MODERATE' },
  { id: 'e3', time: '14:30:55', title: 'Traffic context changed', detail: 'Density increased to heavy', severity: 'LOW' },
  { id: 'e4', time: '14:29:12', title: 'Gaze restored', detail: 'Forward attention returned', severity: 'INFO' },
];
const fallbackPipeline = [
  { id: 'capture', label: 'Camera capture', status: 'ONLINE', latency: 8 },
  { id: 'perception', label: 'Visual perception', status: 'ONLINE', latency: 17 },
  { id: 'driver', label: 'Driver state', status: 'ONLINE', latency: 9 },
  { id: 'fusion', label: 'Context fusion', status: 'ONLINE', latency: 6 },
  { id: 'risk', label: 'Risk inference', status: 'ONLINE', latency: 2 },
];
const makePoints = (count: number, spread = 0) => Array.from({ length: count }, (_, index) => ({
  label: `${String(index + 1).padStart(2, '0')}:00`,
  risk: Math.round(43 + Math.sin(index / 2.1) * 13 + (index % 4 === 0 ? 10 : 0) + spread),
  distraction: Math.round(26 + Math.sin(index / 2.8) * 12 + (index % 5 === 0 ? 22 : 0)),
  drowsiness: Math.round(19 + Math.cos(index / 2.7) * 7),
  laneDeviation: Math.round(13 + Math.sin(index / 1.7) * 8),
  braking: Math.round(9 + (index % 6 === 0 ? 23 : 0)),
}));

const fallbackAnalytics = {
  range: '24H',
  points: makePoints(18),
  summary: { highRiskPeriods: 4, distractionEvents: 12, hardBraking: 3, avgRisk: 47.2 },
};
const fallbackScenarios = [
  { id: 'commute', name: 'Urban commute', description: 'Dense traffic, intermittent distraction', riskScore: 68, riskLevel: 'HIGH' },
  { id: 'rain', name: 'Wet road approach', description: 'Reduced grip and slower visual recovery', riskScore: 76, riskLevel: 'HIGH' },
  { id: 'fatigue', name: 'Late shift fatigue', description: 'Yawning, gaze drift, slower response', riskScore: 84, riskLevel: 'CRITICAL' },
  { id: 'clear', name: 'Clear route baseline', description: 'Stable driver and low-context load', riskScore: 24, riskLevel: 'LOW' },
];

export function useDriveGuard(range: string = '24H') {
  const client = useQueryClient();
  const [localRisk, setLocalRisk] = useState<any>(null);
  const health = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), retry: false, refetchInterval: 15000 } });
  const riskQuery = useGetRisk({ query: { queryKey: getGetRiskQueryKey(), refetchInterval: 5000, retry: false } });
  const driverQuery = useGetDriverState({ query: { queryKey: getGetDriverStateQueryKey(), refetchInterval: 5000, retry: false } });
  const roadQuery = useGetRoadContext({ query: { queryKey: getGetRoadContextQueryKey(), refetchInterval: 5000, retry: false } });
  const statusQuery = useGetSystemStatus({ query: { queryKey: getGetSystemStatusQueryKey(), refetchInterval: 5000, retry: false } });
  const timelineQuery = useGetRiskTimeline({ query: { queryKey: getGetRiskTimelineQueryKey(), refetchInterval: 5000, retry: false } });
  const pipelineQuery = useGetAiPipeline({ query: { queryKey: getGetAiPipelineQueryKey(), refetchInterval: 7000, retry: false } });
  const analyticsQuery = useGetAnalytics({ range: range as '1H' | '6H' | '24H' | '7D' }, { query: { queryKey: getGetAnalyticsQueryKey({ range: range as '1H' | '6H' | '24H' | '7D' }), retry: false } });
  const scenariosQuery = useGetDemoScenarios({ query: { queryKey: getGetDemoScenariosQueryKey(), retry: false } });
  const selection = useSelectDemoScenario();

  const isBackendOffline = health.isError && !health.data;
  const risk = localRisk ?? riskQuery.data ?? fallbackRisk;
  const driver = driverQuery.data ?? fallbackDriver;
  const road = roadQuery.data ?? fallbackRoad;
  const status = statusQuery.data ?? fallbackStatus;
  const timeline = timelineQuery.data ?? fallbackTimeline;
  const pipeline = pipelineQuery.data ?? fallbackPipeline;
  const analytics = analyticsQuery.data ?? { ...fallbackAnalytics, range, points: makePoints(range === '7D' ? 28 : range === '1H' ? 12 : 18, range === '7D' ? 4 : 0) };
  const scenarios = scenariosQuery.data ?? fallbackScenarios;
  const loading = riskQuery.isLoading && driverQuery.isLoading;
  const anyError = [riskQuery, driverQuery, roadQuery, statusQuery].some((query) => query.isError);
  const demoData = !riskQuery.data || !statusQuery.data || Boolean(status.demoMode);

  const chooseScenario = (scenarioId: string) => {
    const local = scenarios.find((scenario: any) => scenario.id === scenarioId);
    if (local) setLocalRisk({ ...fallbackRisk, riskScore: local.riskScore, riskLevel: local.riskLevel, reasons: local.riskLevel === 'LOW' ? ['Stable forward gaze', 'Clear road context', 'No persistent vehicle conflict'] : fallbackRisk.reasons });
    selection.mutate({ data: { scenarioId } }, {
      onSuccess: (result) => {
        setLocalRisk(result);
        client.setQueryData(getGetRiskQueryKey(), result);
        void Promise.all([
          client.invalidateQueries({ queryKey: getGetDriverStateQueryKey() }),
          client.invalidateQueries({ queryKey: getGetRoadContextQueryKey() }),
          client.invalidateQueries({ queryKey: getGetSystemStatusQueryKey() }),
          client.invalidateQueries({ queryKey: getGetRiskTimelineQueryKey() }),
          client.invalidateQueries({ queryKey: getGetAnalyticsQueryKey({ range: range as '1H' | '6H' | '24H' | '7D' }) }),
        ]);
      },
      onError: () => {
        if (local) client.setQueryData(getGetRiskQueryKey(), { ...fallbackRisk, riskScore: local.riskScore, riskLevel: local.riskLevel, reasons: local.riskLevel === 'LOW' ? ['Stable forward gaze', 'Clear road context', 'No persistent vehicle conflict'] : fallbackRisk.reasons });
      },
    });
  };

  return useMemo(() => ({
    health, risk, driver, road, status, timeline, pipeline, analytics, scenarios, loading, anyError,
    demoData, isBackendOffline, chooseScenario, selectingScenario: selection.isPending,
  }), [health, risk, driver, road, status, timeline, pipeline, analytics, scenarios, loading, anyError, demoData, isBackendOffline, selection.isPending]);
}