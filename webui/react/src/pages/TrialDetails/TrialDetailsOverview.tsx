import React, { useCallback, useEffect, useMemo, useState } from 'react';

import useSettings from 'hooks/useSettings';
import TrialInfoBox from 'pages/TrialDetails/TrialInfoBox';
import { V1MetricNamesResponse } from 'services/api-ts-sdk';
import { detApi } from 'services/apiConfig';
import { readStream } from 'services/utils';
import { ExperimentBase, MetricName, MetricType, TrialDetails } from 'types';
import handleError from 'utils/error';
import { alphaNumericSorter } from 'utils/sort';

import { ErrorType } from '../../shared/utils/error';

import TrialChart from './TrialChart';
import css from './TrialDetailsOverview.module.scss';
import settingsConfig, { Settings } from './TrialDetailsOverview.settings';
import TrialDetailsWorkloads from './TrialDetailsWorkloads';

export interface Props {
  experiment: ExperimentBase;
  trial?: TrialDetails;
}

const TrialDetailsOverview: React.FC<Props> = ({ experiment, trial }: Props) => {
  const storagePath = `trial-detail/experiment/${experiment.id}`;
  const {
    settings,
    updateSettings,
  } = useSettings<Settings>(settingsConfig, { storagePath });

  const [ metricNames, setMetricNames ] = useState<MetricName[]>([]);

  // Stream available metrics.
  useEffect(() => {
    const canceler = new AbortController();
    const trainingMetricsMap: Record<string, boolean> = {};
    const validationMetricsMap: Record<string, boolean> = {};

    readStream<V1MetricNamesResponse>(
      detApi.StreamingInternal.metricNames(
        experiment.id,
        undefined,
        { signal: canceler.signal },
      ),
      event => {
        if (!event) return;
        /*
         * The metrics endpoint can intermittently send empty lists,
         * so we keep track of what we have seen on our end and
         * only add new metrics we have not seen to the list.
         */
        (event.trainingMetrics || []).forEach(metric => trainingMetricsMap[metric] = true);
        (event.validationMetrics || []).forEach(metric => validationMetricsMap[metric] = true);
        const newTrainingMetrics = Object.keys(trainingMetricsMap).sort(alphaNumericSorter);
        const newValidationMetrics = Object.keys(validationMetricsMap).sort(alphaNumericSorter);
        const newMetrics = [
          ...(newValidationMetrics || []).map(name => ({ name, type: MetricType.Validation })),
          ...(newTrainingMetrics || []).map(name => ({ name, type: MetricType.Training })),
        ];
        setMetricNames(newMetrics);
      },
    ).catch(() => {
      handleError({
        publicMessage: `Failed to load metric names for experiment ${experiment.id}.`,
        publicSubject: 'Experiment metric name stream failed.',
        type: ErrorType.Api,
      });
    });
    return () => canceler.abort();
  }, [ experiment.id ]);

  const { defaultMetrics, metrics } = useMemo(() => {
    const validationMetric = experiment?.config?.searcher.metric;
    const defaultValidationMetric = metricNames.find(metricName => (
      metricName.name === validationMetric && metricName.type === MetricType.Validation
    ));
    const fallbackMetric = metricNames && metricNames.length !== 0 ? metricNames[0] : undefined;
    const defaultMetric = defaultValidationMetric || fallbackMetric;
    const defaultMetrics = defaultMetric ? [ defaultMetric ] : [];
    const settingMetrics: MetricName[] = (settings.metric || []).map(metric => {
      const splitMetric = metric.split('|');
      return { name: splitMetric[1], type: splitMetric[0] as MetricType };
    });
    const metrics = settingMetrics.length !== 0 ? settingMetrics : defaultMetrics;
    return { defaultMetrics, metrics };
  }, [ experiment?.config?.searcher, settings.metric, metricNames ]);

  const handleMetricChange = useCallback((value: MetricName[]) => {
    const newMetrics = value.map(metricName => `${metricName.type}|${metricName.name}`);
    updateSettings({ metric: newMetrics, tableOffset: 0 });
  }, [ updateSettings ]);

  return (
    <div className={css.base}>
      <TrialInfoBox experiment={experiment} trial={trial} />
      <TrialChart
        defaultMetricNames={defaultMetrics}
        metricNames={metricNames}
        metrics={metrics}
        trialId={trial?.id}
        onMetricChange={handleMetricChange}
      />
      <TrialDetailsWorkloads
        defaultMetrics={defaultMetrics}
        experiment={experiment}
        metricNames={metricNames}
        metrics={metrics}
        settings={settings}
        trial={trial}
        updateSettings={updateSettings}
      />
    </div>
  );
};

export default TrialDetailsOverview;
