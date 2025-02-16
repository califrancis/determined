import { Tabs } from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router';

import Page from 'components/Page';
import RoutePagination from 'components/RoutePagination';
import TrialLogPreview from 'components/TrialLogPreview';
import { terminalRunStates } from 'constants/states';
import usePolling from 'hooks/usePolling';
import TrialDetailsHeader from 'pages/TrialDetails/TrialDetailsHeader';
import TrialDetailsHyperparameters from 'pages/TrialDetails/TrialDetailsHyperparameters';
import TrialDetailsLogs from 'pages/TrialDetails/TrialDetailsLogs';
import TrialDetailsOverview from 'pages/TrialDetails/TrialDetailsOverview';
import TrialDetailsProfiles from 'pages/TrialDetails/TrialDetailsProfiles';
import TrialRangeHyperparameters from 'pages/TrialDetails/TrialRangeHyperparameters';
import { paths } from 'routes/utils';
import { getExperimentDetails, getTrialDetails, isNotFound } from 'services/api';
import Message, { MessageType } from 'shared/components/Message';
import Spinner from 'shared/components/Spinner/Spinner';
import { ExperimentBase, TrialDetails } from 'types';
import handleError from 'utils/error';
import { isSingleTrialExperiment } from 'utils/experiment';

import { ApiState } from '../shared/types';
import { ErrorType } from '../shared/utils/error';
import { isAborted } from '../shared/utils/service';

const { TabPane } = Tabs;

enum TabType {
  Hyperparameters = 'hyperparameters',
  Logs = 'logs',
  Overview = 'overview',
  Profiler = 'profiler',
  Workloads = 'workloads',
}

interface Params {
  experimentId?: string;
  tab?: TabType;
  trialId: string;
}

const DEFAULT_TAB_KEY = TabType.Overview;

const TrialDetailsComp: React.FC = () => {
  const [ canceler ] = useState(new AbortController());
  const [ experiment, setExperiment ] = useState<ExperimentBase>();
  const history = useHistory();
  const routeParams = useParams<Params>();
  const [ tabKey, setTabKey ] = useState<TabType>(routeParams.tab || DEFAULT_TAB_KEY);
  const [ trialId, setTrialId ] = useState<number>(parseInt(routeParams.trialId));
  const [ trialDetails, setTrialDetails ] = useState<ApiState<TrialDetails>>({
    data: undefined,
    error: undefined,
    isLoading: true,
  });
  const pageRef = useRef<HTMLElement>(null);

  const basePath = paths.trialDetails(routeParams.trialId, routeParams.experimentId);
  const trial = trialDetails.data;

  const fetchExperimentDetails = useCallback(async () => {
    if (!trial) return;

    try {
      const response = await getExperimentDetails(
        { id: trial.experimentId },
        { signal: canceler.signal },
      );
      setExperiment(response);

      // Experiment id does not exist in route, reroute to the one with it
      if (!routeParams.experimentId) {
        history.replace(paths.trialDetails(trial.id, trial.experimentId));
      }
    } catch (e) {
      handleError(e, {
        publicMessage: 'Failed to load experiment details.',
        publicSubject: 'Unable to fetch Trial Experiment Detail',
        silent: false,
        type: ErrorType.Api,
      });
    }
  }, [
    canceler,
    history,
    routeParams.experimentId,
    trial,
  ]);

  const fetchTrialDetails = useCallback(async () => {
    try {
      const response = await getTrialDetails({ id: trialId }, { signal: canceler.signal });
      setTrialDetails(prev => ({ ...prev, data: response, isLoading: false }));
    } catch (e) {
      if (!trialDetails.error && !isAborted(e)) {
        setTrialDetails(prev => ({ ...prev, error: e as Error }));
      }
    }
  }, [ canceler, trialDetails.error, trialId ]);

  const handleTabChange = useCallback(key => {
    setTabKey(key);
    history.replace(key === DEFAULT_TAB_KEY ? basePath : `${basePath}/${key}`);
  }, [ basePath, history ]);

  const handleViewLogs = useCallback(() => {
    setTabKey(TabType.Logs);
    history.replace(`${basePath}/${TabType.Logs}?tail`);
  }, [ basePath, history ]);

  const { stopPolling } = usePolling(fetchTrialDetails, { rerunOnNewFn: true });

  useEffect(() => {
    setTrialId(parseInt(routeParams.trialId));
  }, [ routeParams.trialId ]);

  useEffect(() => {
    fetchTrialDetails();
  }, [ fetchTrialDetails, trialId ]);

  useEffect(() => {
    fetchExperimentDetails();
  }, [ fetchExperimentDetails ]);

  useEffect(() => {
    if (trialDetails.data && terminalRunStates.has(trialDetails.data.state)) {
      stopPolling();
    }
  }, [ trialDetails.data, stopPolling ]);

  useEffect(() => {
    return () => canceler.abort();
  }, [ canceler ]);

  if (isNaN(trialId)) {
    return <Message title={`Invalid Trial ID ${routeParams.trialId}`} />;
  }

  if (trialDetails.error !== undefined) {
    const message = isNotFound(trialDetails.error) ?
      `Unable to find Trial ${trialId}` :
      `Unable to fetch Trial ${trialId}`;
    return (
      <Message
        message={trialDetails.error.message}
        title={message}
        type={MessageType.Warning}
      />
    );
  }

  if (!trial || !experiment) {
    return <Spinner tip={`Fetching ${trial ? 'experiment' : 'trial'} information...`} />;
  }

  return (
    <Page
      bodyNoPadding
      containerRef={pageRef}
      headerComponent={(
        <TrialDetailsHeader
          experiment={experiment}
          fetchTrialDetails={fetchTrialDetails}
          trial={trial}
        />
      )}
      stickyHeader
      title={`Trial ${trialId}`}>
      <TrialLogPreview
        hidePreview={tabKey === TabType.Logs}
        trial={trial}
        onViewLogs={handleViewLogs}>
        <Tabs
          activeKey={tabKey}
          className="no-padding"
          tabBarExtraContent={(
            <div style={{ bottom: 9, position: 'relative' }}>
              <RoutePagination
                currentId={trialId}
                ids={experiment.trialIds ?? []}
                tooltipLabel="Trial"
                onSelectId={(selectedTrialId) => {
                  history.push(paths.trialDetails(selectedTrialId, experiment?.id));
                }}
              />
            </div>
          )}
          onChange={handleTabChange}>
          <TabPane key={TabType.Overview} tab="Overview">
            <TrialDetailsOverview experiment={experiment} trial={trial} />
          </TabPane>
          <TabPane key={TabType.Hyperparameters} tab="Hyperparameters">
            {isSingleTrialExperiment(experiment) ?
              <TrialDetailsHyperparameters pageRef={pageRef} trial={trial} /> :
              <TrialRangeHyperparameters experiment={experiment} trial={trial} />
            }
          </TabPane>
          <TabPane key={TabType.Profiler} tab="Profiler">
            <TrialDetailsProfiles experiment={experiment} trial={trial} />
          </TabPane>
          <TabPane key={TabType.Logs} tab="Logs">
            <TrialDetailsLogs experiment={experiment} trial={trial} />
          </TabPane>
        </Tabs>
      </TrialLogPreview>
    </Page>
  );
};

export default TrialDetailsComp;
